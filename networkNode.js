const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./Blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const rp = require('request-promise');
const nodeAddress = uuid().split('-').join('');

const bitcoin = new Blockchain();
var shell = require('shelljs');
// shell.echo('hello world');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
  verification_sector = new Array();

//details
app.get('/blockchain', function (req, res) {
  res.send(bitcoin);
});

app.get('/startnode',function (req , res) {
  console.log("fd");
  shell.exec("concurrently \"npm run node_3\"", {silent:true}).stdout;
})

// create a new transaction
app.post('/transaction', function(req, res) {
	const newTransaction = req.body;
	const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
	res.json({ note: `Transaction will be added in block ${blockIndex}.` });
});


// mine a block
app.get('/mine', function(req, res) {
	const lastBlock = bitcoin.getLastBlock();
	const previousBlockHash = lastBlock['hash'];
	const currentBlockData = {
		transactions: bitcoin.pendingTransactions,
		index: lastBlock['index'] + 1
	};
	const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
	const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
	const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);

	const requestPromises = [];
	bitcoin.networkNodes.forEach(networkNodeUrl => {
		const requestOptions = {
			uri: networkNodeUrl + '/receive-new-block',
			method: 'POST',
			body: { newBlock: newBlock },
			json: true
		};

		requestPromises.push(rp(requestOptions));
	});

	Promise.all(requestPromises)
	.then(data => {
		const requestOptions = {
			uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
			method: 'POST',
			body: {
				amount: 12.5,
				sender: "00",
				recipient: nodeAddress
			},
			json: true
		};

		return rp(requestOptions);
	})
	.then(data => {
		res.json({
			note: "New block mined & broadcast successfully",
			block: newBlock
		});
	});
});


// receive new block
app.post('/receive-new-block', function(req, res) {
	const newBlock = req.body.newBlock;
	const lastBlock = bitcoin.getLastBlock();
	const correctHash = lastBlock.hash === newBlock.previousBlockHash;
	const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

	if (correctHash && correctIndex) {
		bitcoin.chain.push(newBlock);
		bitcoin.pendingTransactions = [];
		res.json({
			note: 'New block received and accepted.',
			newBlock: newBlock
		});
	} else {
		res.json({
			note: 'New block rejected.',
			newBlock: newBlock
		});
	}
});

nodes=[];
// register a node and broadcast it the network
app.post('/register-and-broadcast-node', function(req, res) {
	const newNodeUrl = req.body.newNodeUrl;
  nodes.push(newNodeUrl[19]+newNodeUrl[20]);
  // console.log("nodes are= " + networkNodes[4]);
	if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1) bitcoin.networkNodes.push(newNodeUrl);

	const regNodesPromises = [];
	bitcoin.networkNodes.forEach(networkNodeUrl => {
		const requestOptions = {
			uri: networkNodeUrl + '/register-node',
			method: 'POST',
			body: { newNodeUrl: newNodeUrl },
			json: true
		};

		regNodesPromises.push(rp(requestOptions));
	});

	Promise.all(regNodesPromises)
	.then(data => {
		const bulkRegisterOptions = {
			uri: newNodeUrl + '/register-nodes-bulk',
			method: 'POST',
			body: { allNetworkNodes: [ ...bitcoin.networkNodes, bitcoin.currentNodeUrl ] },
			json: true
		};

		return rp(bulkRegisterOptions);
	})
	.then(data => {
		res.json({ note: 'New node registered with network successfully.' });
	});
});


// register a node with the network
app.post('/register-node', function(req, res) {
	const newNodeUrl = req.body.newNodeUrl;
	const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
	const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
	if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(newNodeUrl);
	res.json({ note: 'New node registered successfully.' });
});


// register multiple nodes at once
app.post('/register-nodes-bulk', function(req, res) {
	const allNetworkNodes = req.body.allNetworkNodes;
	allNetworkNodes.forEach(networkNodeUrl => {
		const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
		const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
		if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(networkNodeUrl);
	});

	res.json({ note: 'Bulk registration successful.' });
});


// consensus
app.get('/consensus', function(req, res) {
	const requestPromises = [];
	bitcoin.networkNodes.forEach(networkNodeUrl => {
		const requestOptions = {
			uri: networkNodeUrl + '/blockchain',
			method: 'GET',
			json: true
		};

		requestPromises.push(rp(requestOptions));
	});

	Promise.all(requestPromises)
	.then(blockchains => {
		const currentChainLength = bitcoin.chain.length;
		let maxChainLength = currentChainLength;
		let newLongestChain = null;
		let newPendingTransactions = null;

		blockchains.forEach(blockchain => {
			if (blockchain.chain.length > maxChainLength) {
				maxChainLength = blockchain.chain.length;
				newLongestChain = blockchain.chain;
				newPendingTransactions = blockchain.pendingTransactions;
			};
		});


		if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
			res.json({
				note: 'Current chain has not been replaced.',
				chain: bitcoin.chain
			});
		}
		else {
			bitcoin.chain = newLongestChain;
			bitcoin.pendingTransactions = newPendingTransactions;
			res.json({
				note: 'This chain has been replaced.',
				chain: bitcoin.chain
			});
		}
	});
});


// get block by blockHash
app.get('/block/:blockHash', function(req, res) {
	const blockHash = req.params.blockHash;
	const correctBlock = bitcoin.getBlock(blockHash);
	res.json({
		block: correctBlock
	});
});


// get transaction by transactionId
app.get('/transaction/:transactionId', function(req, res) {
	const transactionId = req.params.transactionId;
	const trasactionData = bitcoin.getTransaction(transactionId);
	res.json({
		transaction: trasactionData.transaction,
		block: trasactionData.block
	});
});


// get address by address
app.get('/address/:address', function(req, res) {
	const address = req.params.address;
	const addressData = bitcoin.getAddressData(address);
	res.json({
		addressData: addressData
	});
});


// block explorer
app.get('/block-explorer', function(req, res) {
	res.sendFile('./block-explorer/index.html', { root: __dirname });
});


var sectors=[]
var mining_sector=[]
app.get('/sector_allocation' , function (req , res) {

  sectors=bitcoin.allot_sectors(port,nodes);
  res.json({ note: `Blocks are alloted` });
  console.log("sector are= " + sectors);
  console.log("no of sectors = " + sectors.length);
  var currentNodeId=port;                      // place Your current node id here
  var currentNodeSector=0;
  for (i=0;i<sectors.length;i++)
  {
      for (j=0;j<sectors[i].length;j++)
      {
        if(sectors[i][j]==currentNodeId)
        {
          currentNodeSector=i
          break;
        }
      }
  }
  console.log("current node sector==" + currentNodeSector);

  for (var a=[],i=0;i<sectors.length;++i)
  {
    a[i]=i;
  }
  a=bitcoin.shuffle(a)
  var count=0;
  var i=0;
  for (i=0;i<sectors.length;i++)
  {
      if(count==sectors.length/2)
      {
          break;
      }
      if(a[i]!=currentNodeSector)
      {
          verification_sector[count]=a[i];
          count++;
      }

  }

  for (j=i;j<sectors.length;j++)
  {
    if(a[j]!=currentNodeSector)
    {
        mining_sector=a[j];
    }
  }

  console.log("mining sector is = " + mining_sector);
  console.log("verification sectors are = " + verification_sector);

})

// broadcast transaction
app.post('/transaction/broadcast', function(req, res) {
	const newTransaction = bitcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
	bitcoin.addTransactionToPendingTransactions(newTransaction);

	const requestPromises = [];
  const urlss=[]
  console.log("verification_sector="+verification_sector);
  for (i=0;i<verification_sector.length;++i)
  {
    for (j=0;j<sectors[verification_sector[i]].length;++j)
    {
      urlss[i+j]=sectors[verification_sector[i]][j];
    }
  }

  //urls for verification
  urlss.sort();
  for(var i =0;i<urlss.length;i++)
  {urlss[i]+=1;
  }

  console.log("urlss="+urlss);

  console.log("all urls="+bitcoin.networkNodes);

	bitcoin.networkNodes.forEach(networkNodeUrl => {

    if (bitcoin.in_array(urlss,networkNodeUrl[20]))
    {
		const requestOptions = {
			uri: networkNodeUrl + '/transaction',
			method: 'POST',
			body: newTransaction,
			json: true
		};

		requestPromises.push(rp(requestOptions));
	}

});

	Promise.all(requestPromises)
	.then(data => {
		res.json({ note: 'Transaction created and broadcast successfully.' });
	});
});

app.post('/sector', function(req, res) {
	const newsector = req.body;
	const blockIndex = bitcoin.addSectorsToSectors_list(newsector);
	res.json({ note: `Sector will be added ${blockIndex}.` });
});

app.post('/sector/broadcast', function(req, res) {
	const newsector = bitcoin.createNewSector(req.body.indices, req.body.veri, req.body.minee);
	bitcoin.addSectorsToSectors_list(newsector);

	const requestPromises = [];
  bitcoin.networkNodes.forEach(networkNodeUrl => {
		const requestOptions = {
			uri: networkNodeUrl + '/sector',
			method: 'POST',
			body: newsector,
			json: true
		};

		requestPromises.push(rp(requestOptions));


});

	Promise.all(requestPromises)
	.then(data => {
		res.json({ note: 'sector created and broadcast successfully.' });
	});
});

const server = app.listen(port, function() {
	console.log(`Listening on port ${port}...`);
});
