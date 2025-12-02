import { ethers } from 'ethers';

const ANKR_RPC_URL = 'https://rpc.ankr.com/bsc/028ccb835f1d6701e2999849bacfc5b6b4799c21443089c5de8662f2ae1fde41';
const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;

const USDT_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
];

async function testAnkrSync() {
    console.log('='.repeat(60));
    console.log('ANKR BSC USDT SYNC TEST');
    console.log('='.repeat(60));
    
    const walletAddress = process.argv[2];
    if (!walletAddress) {
        console.log('\nUsage: node scripts/test-ankr-sync.mjs <WALLET_ADDRESS>');
        console.log('Example: node scripts/test-ankr-sync.mjs 0x1234...abcd');
        process.exit(1);
    }
    
    console.log(`\nWallet: ${walletAddress}`);
    console.log(`RPC: ${ANKR_RPC_URL.substring(0, 40)}...`);
    
    try {
        console.log('\n1. Connecting to Ankr RPC...');
        const provider = new ethers.JsonRpcProvider(ANKR_RPC_URL);
        
        const currentBlock = await provider.getBlockNumber();
        console.log(`   ✓ Connected! Current block: ${currentBlock}`);
        
        const currentBlockData = await provider.getBlock(currentBlock);
        const currentTimestamp = currentBlockData?.timestamp || Math.floor(Date.now() / 1000);
        console.log(`   ✓ Current time: ${new Date(currentTimestamp * 1000).toISOString()}`);
        
        console.log('\n2. Calculating today\'s block range...');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTimestamp = Math.floor(todayStart.getTime() / 1000);
        
        const secondsSinceMidnight = currentTimestamp - todayStartTimestamp;
        const blocksSinceMidnight = Math.floor(secondsSinceMidnight / 3);
        const startBlock = currentBlock - blocksSinceMidnight;
        
        console.log(`   Today started at: ${todayStart.toISOString()}`);
        console.log(`   Start block (estimated): ${startBlock}`);
        console.log(`   Block range: ${startBlock} - ${currentBlock} (${currentBlock - startBlock} blocks)`);
        
        console.log('\n3. Setting up USDT contract filter...');
        const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, provider);
        
        const toFilter = usdtContract.filters.Transfer(null, walletAddress);
        const fromFilter = usdtContract.filters.Transfer(walletAddress, null);
        
        console.log('\n4. Fetching USDT Transfer events for today...');
        console.log('   (This may take a moment...)');
        
        const BATCH_SIZE = 2000;
        const toEvents = [];
        const fromEvents = [];
        
        for (let blockStart = startBlock; blockStart < currentBlock; blockStart += BATCH_SIZE) {
            const blockEnd = Math.min(blockStart + BATCH_SIZE, currentBlock);
            console.log(`   Querying blocks ${blockStart}-${blockEnd}...`);
            
            const [batchTo, batchFrom] = await Promise.all([
                usdtContract.queryFilter(toFilter, blockStart, blockEnd),
                usdtContract.queryFilter(fromFilter, blockStart, blockEnd),
            ]);
            
            toEvents.push(...batchTo);
            fromEvents.push(...batchFrom);
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`\n   ✓ Found ${toEvents.length} incoming transfers`);
        console.log(`   ✓ Found ${fromEvents.length} outgoing transfers`);
        
        const allEvents = [...toEvents, ...fromEvents].sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
            return (a.transactionIndex || 0) - (b.transactionIndex || 0);
        });
        
        console.log(`   ✓ Total: ${allEvents.length} transactions`);
        
        if (allEvents.length > 0) {
            console.log('\n5. Transaction Details:');
            console.log('-'.repeat(60));
            
            let highestBlock = 0;
            
            for (const event of allEvents) {
                const block = await provider.getBlock(event.blockNumber);
                const timestamp = block?.timestamp || 0;
                const date = new Date(timestamp * 1000).toLocaleString();
                
                const from = event.args?.from || '';
                const to = event.args?.to || '';
                const value = event.args?.value?.toString() || '0';
                const amount = parseFloat(value) / (10 ** USDT_DECIMALS);
                
                const isIncoming = to.toLowerCase() === walletAddress.toLowerCase();
                const type = isIncoming ? 'INFLOW ⬇️' : 'OUTFLOW ⬆️';
                const clientAddr = isIncoming ? from : to;
                
                highestBlock = Math.max(highestBlock, event.blockNumber);
                
                console.log(`\n   ${type} | ${amount.toFixed(2)} USDT`);
                console.log(`   Date: ${date}`);
                console.log(`   Block: ${event.blockNumber}`);
                console.log(`   Hash: ${event.transactionHash}`);
                console.log(`   ${isIncoming ? 'From' : 'To'}: ${clientAddr.substring(0, 10)}...${clientAddr.substring(clientAddr.length - 8)}`);
            }
            
            console.log('\n' + '-'.repeat(60));
            console.log(`\n6. Summary:`);
            console.log(`   Total transactions: ${allEvents.length}`);
            console.log(`   Incoming: ${toEvents.length}`);
            console.log(`   Outgoing: ${fromEvents.length}`);
            console.log(`   Highest block processed: ${highestBlock}`);
            console.log(`   ⚡ Save this for next sync: lastSyncedBlock = ${highestBlock}`);
        } else {
            console.log('\n5. No transactions found for today.');
            console.log('   This could mean:');
            console.log('   - No USDT was sent/received today');
            console.log('   - The wallet address might be incorrect');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETE ✓');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.code) console.error('   Code:', error.code);
        process.exit(1);
    }
}

testAnkrSync();
