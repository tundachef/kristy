const { Web3 } = require('web3');
const axios = require('axios');
const fs = require('fs/promises');
const { exec } = require('child_process');
const AfricasTalking = require('africastalking');

// Set your app credentials
const credentials = {
  apiKey: 'YourAPIKey',
  username: 'YourUsername',
};

// Initialize the SDK
const AfricasTalkingSDK = AfricasTalking(credentials);

// Get the SMS service
const sms = AfricasTalkingSDK.SMS;

// Constants and Configuration
const BSC_NODE_URL = 'http://127.0.0.1:7545';
const MIN_BALANCE_THRESHOLD_USD = 10;
const API_KEY = 'YourApiKeyToken';

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

    if (overallBalanceInUSD < MIN_BALANCE_THRESHOLD_USD) {
      return null;
    }

    balances.overallBalance = overallBalanceInUSD;
    return balances;
  } catch (error) {
    console.error(`Error getting balances for contract at ${contractAddress}:`, error);
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
    to: ['+254711XXXYYY', '+254733YYYZZZ'], // Replace with your phone numbers
    message,
    from: 'XXYYZZ', // Replace with your shortCode or senderId
  };

  sms.send(options)
    .then(console.log)
    .catch(console.log);
}

async function processBlocks() {
  try {
    const latestBlockNumber = await web3.eth.getBlockNumber();
    console.log(`Latest Block Number: ${latestBlockNumber}`);

    let addressesArray = [];

    for (let blockNumber = 0; blockNumber <= latestBlockNumber; blockNumber++) {
      const block = await web3.eth.getBlock(blockNumber, true);

      if (block && block.transactions) {
        const blockBalances = [];

        for (const tx of block.transactions) {
          if (!tx.to) {
            const contractAddress = tx.creates;
            const contractBalances = await getContractBalances(contractAddress);

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
