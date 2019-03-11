var express = require('express');
var app = express();
const uuid = require('uuid/v1');
const port = process.argv[2];

const rp = require('request-promise');

const nodeAddress = uuid().split('-').join('');

const bodyparser = require('body-parser');
const Blockchain = require('./Blockchain');
const bitcoin = new Blockchain();

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({extended:false}));

app.get('/blockchain', function(req,res){
  res.send(bitcoin);
});

app.post('/transaction', function(req,res){
  const blockIndex = bitcoin.createNewTransaction(req.body.amount, req.body.sender , req.body.recipient)
  res.json({ note : 'transaction will be added in block '+blockIndex})
});

app.get('/mine', function (req , res) {
  const lastBlock=bitcoin.getLastBlock();
  const previousBlockHash = lastBlock['hash'];
  const currentBlockData = {
    transactions:bitcoin.pendingTransactions ,
    index : lastBlock['index']+1
  };

  const nonce= bitcoin.proofOfWork(previousBlockHash,currentBlockData);

  const blockHash = bitcoin.hashBlock(previousBlockHash,currentBlockData,nonce);
  bitcoin.createNewTransaction("12.5" , "00" , nodeAddress );
  const newBlock = bitcoin.createNewBlock(nonce , previousBlockHash , blockHash);
  console.log(newBlock);
  res.json({
    note:"new block added successfully" ,
    block: newBlock
  })
});

app.post('/register-and-broadcast-node', function(req, res) {
	const newNodeUrl = req.body.newNodeUrl;
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

app.post('/register-node', function(req, res) {
	const newNodeUrl = req.body.newNodeUrl;
  console.log(newNodeUrl);
	const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
	const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
	if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(newNodeUrl);
	res.json({ note: 'New node registered successfully.' });
});

app.post('/register-nodes-bulk', function(req, res) {
	const allNetworkNodes = req.body.allNetworkNodes;
	allNetworkNodes.forEach(networkNodeUrl => {
		const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
		const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
		if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(networkNodeUrl);
	});

	res.json({ note: 'Bulk registration successful.' });
});
app.listen(port, function(){
  console.log(`listening on port ${port}........`);
});
