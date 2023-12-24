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
const BSC_NODE_URL = process.env.NodeUrl;
const MIN_BALANCE_THRESHOLD_USD = 10;
const API_KEY = process.env.ApiKey;

// Token information (exchange rate to USD)
const tokens = [
  { exchangeRate: 270 }, // Replace with actual token exchange rates
  // Add more tokens as needed
];

const web3 = new Web3(BSC_NODE_URL);

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
    console.log(`Bonzo bal(USD): ${overallBalanceInUSD}`);

    if (overallBalanceInUSD < MIN_BALANCE_THRESHOLD_USD) {
      let ovBal = 0;
      // BUSD
      ovBal = await getTokenBalance(contractAddress, '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', './abis/busd.json', 1);
      if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
        // USDT
        ovBal = await getTokenBalance(contractAddress, '0x55d398326f99059fF775485246999027B3197955', './abis/usdt.json', 1);
        if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
          // ETH
          ovBal = await getTokenBalance(contractAddress, '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', './abis/eth.json', 1);
          if(ovBal < MIN_BALANCE_THRESHOLD_USD) {
            return null;
          }
        }
      }

      balances.overallBalance = ovBal;
      return balances;
    }

    balances.overallBalance = overallBalanceInUSD;
    return balances;
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
  
    console.log(`Balance for contract at ${contractAddress}: ${balanceInUSD} USD`);
    return balanceInUSD;
  } catch (error) {
    console.error(`Error getting balance for contract at ${contractAddress}:`, error);
    return null;
  }
}


async function getContractSourceCode(contractAddress) {
  try {
    const apiUrl = `https://api.bscscan.com/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${API_KEY}`;
    const response = await axios.get(apiUrl);

    const result = response.data.result[0];
    return result && result.SourceCode ? result.SourceCode : null;
  } catch (error) {
    console.error(`Error fetching source code for contract at ${contractAddress}:`, error);
    return null;
  }
}

async function saveAddressesToFile(blockNumber, blockBalances) {
  const fileName = `${blockNumber}.json`;
  try {
    await fs.writeFile(fileName, JSON.stringify(blockBalances, null, 2));
    console.log(`Addresses with Balances over ${MIN_BALANCE_THRESHOLD_USD} USD for Block ${blockNumber} saved to ${fileName}`);
  } catch (error) {
    console.error(`Error saving addresses to file for block ${blockNumber}:`, error);
  }
}

async function analyzeAndSaveIssues(contractAddress, sourceCode) {
  try {
    const solFileName = `${contractAddress}.sol`;
    await fs.writeFile(solFileName, sourceCode);
    console.log(`Source code for contract at ${contractAddress} saved to ${solFileName}`);

    const mythCommand = `myth analyze ${solFileName} -o json`;
    exec(mythCommand, (error, stdout) => {
      if (error) {
        console.error(`Error running myth analyze for ${solFileName}: ${error.message}`);
        return;
      }

      const mythResult = JSON.parse(stdout);
      if (mythResult && mythResult.issues && mythResult.issues.length > 0) {
        const issuesFileName = `${issueFileCounter}. ${contractAddress}.json`;
        fs.writeFile(issuesFileName, JSON.stringify(mythResult, null, 2));
        console.log(`Myth issues for contract at ${contractAddress} saved to ${issuesFileName}`);
        sendSms(`Contract at ${contractAddress} has issues. Check ${issuesFileName} for details.`);
        issueFileCounter++;
      }
    });
  } catch (error) {
    console.error(`Error analyzing and saving issues for contract at ${contractAddress}:`, error);
  }
}

function sendSms(message) {
  const options = {
    to: [process.env.PHONE_NUMBER], // Replace with your phone numbers
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
    const latestBlockNumber = await web3.eth.getBlockNumber();
    // const latestBlockNumber = 20000000;
    console.log(`Latest Block Number: ${latestBlockNumber}`);

    let addressesArray = [];

    for (let blockNumber = latestBlockNumber; blockNumber >= 0; blockNumber--) {
      const block = await web3.eth.getBlock(blockNumber, true);
      console.log(`block checks: ${blockNumber}`);

      if (block && block.transactions) {
        const blockBalances = [];

        for (const tx of block.transactions) {
          // console.log(`Tx: ${tx.to}`);
          if (!tx.to) {
            console.log('Transaction Object: ');
            const contractAddress = (await web3.eth.getTransactionReceipt(tx.hash)).contractAddress;
            console.log(`Contract Address: ${contractAddress}`);
            const contractBalances = await getContractBalances(contractAddress);
            console.log(`Contract Balance: ${contractBalances}`);
            const testBalances = await getContractBalances("0x6DdbA3381663431Ce6c34874A9875b995788008b");
            console.log(`Contract Balance: ${testBalances.overallBalance}`);

            if (contractBalances) {
              blockBalances.push(contractBalances);
              addressesArray.push(contractAddress);
            }
          }
        }

        if (blockBalances.length > 0) {
          await saveAddressesToFile(blockNumber, blockBalances);
          await analyzeAndSaveIssues(addressesArray);
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
