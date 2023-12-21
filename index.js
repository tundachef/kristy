const Web3 = require('web3');

// Connect to your BSC node
const web3 = new Web3('http://localhost:8545');

// Set the starting and ending block numbers
const startBlock = 0; // Replace with your desired start block
const endBlock = 'latest';

// Minimum balance threshold in USD
const minBalanceThresholdUSD = 10;

// Get the latest block number
web3.eth.getBlockNumber().then(async (latestBlockNumber) => {
  console.log(`Latest Block Number: ${latestBlockNumber}`);

  // Determine the end block if it's set to 'latest'
  const finalBlock = endBlock === 'latest' ? latestBlockNumber : Math.min(latestBlockNumber, endBlock);

  // Iterate through blocks in the specified range
  for (let blockNumber = startBlock; blockNumber <= finalBlock; blockNumber++) {
    try {
      // Get block details
      const block = await web3.eth.getBlock(blockNumber, true);

      if (block && block.transactions) {
        // Iterate through transactions in the block
        for (const tx of block.transactions) {
          // Check if it's a contract creation transaction
          if (!tx.to) {
            const contractAddress = tx.creates;

            // Check the balance of the contract
            const balanceInWei = await web3.eth.getBalance(contractAddress);
            const balanceInEth = web3.utils.fromWei(balanceInWei, 'ether');

            console.log(`Contract Address: ${contractAddress}`);
            console.log(`Balance in ETH: ${balanceInEth}`);

            // Check balance in USD (Assuming 1 ETH = current ETH price in USD)
            const ethToUsdExchangeRate = 2500; // Replace with the actual exchange rate
            const balanceInUSD = balanceInEth * ethToUsdExchangeRate;

            console.log(`Balance in USD: ${balanceInUSD}`);

            // Check if the balance is greater than the threshold
            if (balanceInUSD > minBalanceThresholdUSD) {
              console.log(`Balance exceeds ${minBalanceThresholdUSD} USD. Additional processing logic can be added here.`);
            } else {
              console.log(`Balance is below ${minBalanceThresholdUSD} USD.`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
});
