const { Web3 } = require('web3');
const axios = require('axios');

// Connect to your BSC node
const web3 = new Web3('http://127.0.0.1:7545');

// Set the starting and ending block numbers
const startBlock = 0; // Replace with your desired start block
const endBlock = 'latest';

// Minimum balance threshold in USD
const minBalanceThresholdUSD = 10;

async function getContractBalances(contractAddress) {
  const balances = {
    contract: contractAddress,
    tokens: {},
  };

  // Check the overall balance of the contract
  const overallBalanceInWei = await web3.eth.getBalance(contractAddress);
  const overallBalanceInEth = web3.utils.fromWei(overallBalanceInWei, 'ether');

  // Convert overall balance to USD (Assuming the first token is the main currency)
  const overallBalanceInUSD = overallBalanceInEth * tokens[0].exchangeRate;

  // Check if the overall balance is less than 10 USD
  if (overallBalanceInUSD < minBalanceThresholdUSD) {
    return null;
  }

  balances.overallBalance = overallBalanceInUSD;

  return balances;
}

async function processBlocks() {
  // Get the latest block number
  const latestBlockNumber = await web3.eth.getBlockNumber();
  console.log(`Latest Block Number: ${latestBlockNumber}`);

  const addressesArray = [];

  // Iterate through blocks in the specified range
  for (let blockNumber = startBlock; blockNumber <= latestBlockNumber; blockNumber++) {
    try {
      // Get block details
      const block = await web3.eth.getBlock(blockNumber, true);

      if (block && block.transactions) {
        const blockBalances = [];

        // Iterate through transactions in the block
        for (const tx of block.transactions) {
          // Check if it's a contract creation transaction
          if (!tx.to) {
            const contractAddress = tx.creates;
            const contractBalances = await getContractBalances(contractAddress);

            if (contractBalances) {
              blockBalances.push(contractBalances);

              // Collect addresses with balances over 10 USD
              addressesArray.push(contractAddress);
            }
          }
        }

        // Save addresses with balances over 10 USD to a JSON file
        if (blockBalances.length > 0) {
          const fileName = `${blockNumber}.json`;
          fs.writeFileSync(fileName, JSON.stringify(blockBalances, null, 2));
          console.log(`Addresses with Balances over ${minBalanceThresholdUSD} USD for Block ${blockNumber} saved to ${fileName}`);
        }
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }

  // Send addresses as an array to a link
  try {
    // const link = 'https://example.com/save-addresses';
    // await axios.post(link, { addresses: addressesArray });
    console.log(addressesArray);
    console.log('Addresses sent to the link successfully.');
  } catch (error) {
    console.error('Error sending addresses to the link:', error);
  }
}

// Start processing blocks
processBlocks();
