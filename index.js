const { Web3 } = require('web3');
const axios = require('axios');
const fs = require('fs/promises');
const fs_ = require('fs');
const { exec } = require('child_process');
const AfricasTalking = require('africastalking');
const path = require('path');
require('dotenv').config();


// Set your app credentials
const credentials = {
  apiKey: process.env.AfricasTalkingApiKey,
  username: process.env.AfricasTalkingUsername,
};

// Initialize the SDK
const AfricasTalkingSDK = AfricasTalking(credentials);

// Get the SMS service
const sms = AfricasTalkingSDK.SMS;

// Constants and Configuration
const ETH_NODE_URL = process.env.NodeUrl;
const MIN_BALANCE_THRESHOLD_USD = 100;
const API_KEY = process.env.ApiKey;

// Token information (exchange rate to USD)
const tokens = [
  { exchangeRate: 2301 }, // Replace with actual token exchange rates
  // Add more tokens as needed
];

const web3 = new Web3(ETH_NODE_URL);

let issueFileCounter = 1; // Counter for auto-incrementing issue file names

async function getContractBalances(contractAddress) {
  try {
    const balances = {
      contract: contractAddress,
      tokens: {},
    };

    const overallBalanceInWei = await web3.eth.getBalance(contractAddress);
    const overallBalanceInEth = web3.utils.fromWei(overallBalanceInWei, 'ether');
    const overallBalanceInUSD = overallBalanceInEth * tokens[0].exchangeRate;
    if (overallBalanceInUSD < MIN_BALANCE_THRESHOLD_USD) {
      let ovBal = 0;
      // USDT
      console.log(contractAddress);
      ovBal = await getTokenBalance(contractAddress, '0xdAC17F958D2ee523a2206206994597C13D831ec7', './abis/usdt.json', 1);
      if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
        // USDC
        ovBal = await getTokenBalance(contractAddress, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', './abis/usdc.json', 1);
        if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
          // BNB
          ovBal = await getTokenBalance(contractAddress, '0xB8c77482e45F1F44dE1745F52C74426C631bDD52', './abis/bnb.json', 1);
          if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
            // WETH
            ovBal = await getTokenBalance(contractAddress, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', './abis/weth.json', 1);
            if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
              return null;
            }
          }
        }
      }

      balances.overallBalance = ovBal;
      return contractAddress;
    }

    balances.overallBalance = overallBalanceInUSD;
    return contractAddress;
  } catch (error) {
    console.error(`Error getting balances for contract at ${contractAddress}:`, error);
    return null;
  }
}

async function getTokenBalance(contractAddress, tokenContractAddress, abiPath, exchangeRate) {
  try {
    // Load ABI from JSON file
    const abiRaw = fs_.readFileSync(path.resolve(__dirname, abiPath), 'utf8');
    const tokenABI = JSON.parse(abiRaw);
  
    const tokenContract = new web3.eth.Contract(tokenABI, tokenContractAddress);
    const balanceInWei = await tokenContract.methods.balanceOf(contractAddress).call();
    const balanceInEther = web3.utils.fromWei(balanceInWei, 'ether');
    const balanceInUSD = balanceInEther * exchangeRate;
    return balanceInUSD;
  } catch (error) {
    console.error(`Error getting balance for contract at ${contractAddress}:`, error);
    return null;
  }
}


// async function getContractSourceCode(contractAddress) {
//   try {
//     const apiUrl = `https://api.bscscan.com/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${API_KEY}`;
//     const response = await axios.get(apiUrl);

//     const result = response.data.result[0];
//     return result && result.SourceCode ? result.SourceCode : null;
//   } catch (error) {
//     console.error(`Error fetching source code for contract at ${contractAddress}:`, error);
//     return null;
//   }
// }

async function saveAddressesToFile(blockNumber, blockBalances) {
  const fileName = `${blockNumber}.json`;
  try {
    await fs.writeFile(fileName, JSON.stringify(blockBalances, null, 2));
    console.log(`Addresses with Balances over ${MIN_BALANCE_THRESHOLD_USD} USD for Block ${blockNumber} saved to ${fileName}`);
  } catch (error) {
    console.error(`Error saving addresses to file for block ${blockNumber}:`, error);
  }
}

async function analyzeContracts(addressesArray) {
  console.log(addressesArray);
  for (let address of addressesArray) {
    try {
      // let sourceCode = await getContractSourceCode(address);
      await analyzeAndSaveIssues(address);
    } catch (error) {
      continue;
    }
  }
}

async function jsonErrorSave(contractAddress) {
  const issuesFileName = path.join('res_json', '0. error.txt');
  let existingContent = '';
  try {
    existingContent = fs_.readFileSync(issuesFileName, 'utf8');
  } catch (err) {}
  existingContent += (existingContent ? '\n' : '') + contractAddress;
  fs_.writeFileSync(issuesFileName, existingContent);
}

let i = 0;
async function analyzeAndSaveIssues(contractAddress) {
    let infuraId = process.env.INFURAID
    const mythCommand = `docker run mythril/myth a -a ${contractAddress} --infura-id=${infuraId} -o json`;
    console.log(mythCommand)
    exec(mythCommand, (error, stdout) => {
      let mythResult;
      try {
        mythResult = JSON.parse(stdout);
      } catch (error) {
        if(i > 2) {
          jsonErrorSave(contractAddress);
          return;
        }
        console.log('Error parsing JSON:', error.message);
        i++;
        analyzeAndSaveIssues(contractAddress);
      }
      if (mythResult && mythResult.issues && mythResult.issues.length > 0) {
        const issuesFileName = path.join('res_json', `${issueFileCounter}. ${contractAddress}.json`);
        fs.writeFile(issuesFileName, JSON.stringify(mythResult, null, 2));
        console.log(`Myth issues for contract at ${contractAddress} saved to ${issuesFileName}`);
        sendSms(`Contract at ${contractAddress} has issues. Check ${issuesFileName} for details.`);
        issueFileCounter++;
      }
    });
}

function sendSms(message) {
  const phone = process.env.PHONE_NUMBER;
  const options = {
    to: [phone], // Replace with your phone numbers
    message,
    // from: 'XXYYZZ', // Replace with your shortCode or senderId (optional)
  };

  sms.send(options)
    .then(console.log)
    .catch(console.log);
}

//testing all funcs
async function processBlocks() {
  try {
    // const latestBlockNumber = await web3.eth.getBlockNumber();
    const latestBlockNumber = 18904525;
    console.log(`Latest Block Number: ${latestBlockNumber}`);

    let addressesArray = [];

    for (let blockNumber = latestBlockNumber; blockNumber >= 0; blockNumber--) {
      const block = await web3.eth.getBlock(blockNumber, true);
      console.log(`block checks: ${blockNumber}`);

      if (block && block.transactions) {
        const blockBalances = [];

        for (const tx of block.transactions) {
          if (!tx.to) {
            const contractAddress = (await web3.eth.getTransactionReceipt(tx.hash)).contractAddress;
            const contractBalances = await getContractBalances(contractAddress);

            if (contractBalances) {
              blockBalances.push(contractBalances);
              addressesArray.push(contractAddress);
            }
          }
        }

        if (blockBalances.length > 0) {
          await saveAddressesToFile(blockNumber, blockBalances);
          await analyzeContracts(addressesArray);
          addressesArray = [];
        }
      }
    }
  } catch (error) {
    console.error('Error processing blocks:', error);
  }
}

// Start processing blocks
processBlocks();

// analyzeAndSaveIssues('0x0000000000450702bC4f750fD1E7Ecad7054c4f1');


// test for v2.0.0

async function getContractSourceCodeTest(contractAddress) {
  try {
    const apiUrl = `https://api.bscscan.com/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${API_KEY}`;
    const response = await axios.get(apiUrl);

    const result = response.data.result[0];
    if (result && result.SourceCode) {
      let sourceCode = result.SourceCode;

      // Check if the SourceCode starts with '{{'
      if (sourceCode.startsWith('{{')) {
        // Replace '{{' with '{' and '}}' with '}'
        sourceCode = sourceCode.replace(/{{/g, '{').replace(/}}/g, '}');
      }

      try {
        // Parse the modified JSON structure
        const xsourceCode = JSON.parse(sourceCode);

        // Extract source code from the JSON structure
        const sourcesString = JSON.stringify(xsourceCode.sources);
        const sourceJson = JSON.parse(
          sourcesString.replaceOnlyFirst(/{/g, '[').replaceOnlyLast(/}/g, ']')
        );

        const files = Object.values(sourceJson).reverse();
        const combinedSourceCode = files.map((file, index) => {
          // Remove lines starting with "import" until ";"
          const contentWithoutImports = file.content.replace(/^import.*?;/gm, '');
        
          // Keep only the first "// SPDX-License-Identifier: MIT"
          const lines = contentWithoutImports.split('\n');
          const firstLicenseIndex = lines.findIndex(line => line.includes('// SPDX-License-Identifier: MIT'));
          const filteredContent = index === 0 ? contentWithoutImports : lines.slice(1).join('\n');
        
          return filteredContent;
        }).join('\n');

        return combinedSourceCode;
      } catch (error) {
        console.log('Error parsing modified JSON structure:', error);
        return result.SourceCode;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching source code for contract at ${contractAddress}:`, error);
    return null;
  }
}

async function cow(contractAddress) {
  let sourceCode = await getContractSourceCodeTest(contractAddress);
  const solFileName = `${contractAddress}.sol`;
  await fs.writeFile(solFileName, sourceCode);
}


// cow('0x2478f070fdc193d4dac6a635aa39a350e9fa2738');
// cow('0xbce3cbb884f45273120e40d3603ab8fc14c590e0');


// Helpers
String.prototype.replaceOnlyFirst = function(search, replacement) {
  const indexOfFirst = this.indexOf(search);
  if (indexOfFirst === -1) {
    return this;
  }
  
  return this.slice(0, indexOfFirst) + replacement + this.slice(indexOfFirst + search.length);
};


String.prototype.replaceOnlyLast = function(search, replacement) {
  const indexOfLast = this.lastIndexOf(search);
  if (indexOfLast === -1) {
    return this;
  }

  return this.slice(0, indexOfLast) + replacement + this.slice(indexOfLast + search.length);
};
