/* ADNet.js */
module.exports = {
  receiveMessage: receiveMessage,
  // setNode: function(node){
  //   RUNNING_NODE = node
  //   //var bus = new Bus({node: node});
  //   var bus = node.openBus(); //{remoteAddress: '127.0.0.1'}
  //   bus.subscribe('adservice/newmessage');
  //   bus.on('adservice/newmessage', function(message){
  //     console.log('newmessage: '+message);
  //   })
  // }
};

var bitcore = require('bitcore-lib')
var explorers = require('bitcore-explorers');
var fs = require('fs');
var ADService = require('./index');
// var apigp = require('./APIgetpost-lib')

// var ADS = new ADService({})
var AD_NET_FILE = 'adnet.json'
var tBTC = bitcore.Networks.testnet
var BTC = bitcore.Networks.livenet
var insight = new explorers.Insight(tBTC);
var MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT
var RUNNING_NODE

function createADNodeFile(nodeData){
  fs.writeFileSync(nodeData.name+".dat", JSON.stringify(nodeData, null, 2));
}

function readADNodeFile(name){
  path = "./nodes/"
  var file = fs.readFileSync(path+name+".dat");
  var nodeData = JSON.parse(file);

  return nodeData
}

/*****************************************************************************/
/* Creates a new Wallet for N nodes (addresses) */
function createADNode(name, options){
  var privateKey = new bitcore.PrivateKey();
  var privateKeyWIF = privateKey.toWIF();
  // var publicKey = privateKey.toPublicKey();
  var tBTCAddress = privateKey.toAddress(tBTC);
  var BTCAddress = privateKey.toAddress(BTC);

  var nodeData = {
    "name": name,
    "privKey": privateKeyWIF,
    "tstAddr": tBTCAddress.toString(),
    "liveAddr": BTCAddress.toString(),
  }
  createADNodeFile(nodeData)
}//createADNode

function updateADNode(name, newData){
  var nodeData = readADNodeFile(name);
}

/* Get Node Status */
function getNodeStatus(name){
  var nodeData = readADNodeFile(name)
  console.log("Node Data:"+JSON.stringify(nodeData,null,2));

  insight.getUnspentUtxos(nodeData.tstAddr, function(err, utxos){
    if(err) return console.log("ERR (getUnspentUtxos): "+err);

    console.log("utxos:"+JSON.stringify(utxos,null,2));
  });
}

/* TEMP */
function randHex(length) {
  var chars = '0123456789abcdef';
  var result = '';
  for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];

  return result;
}


/*****************************************************************************/
/* Create new Node */


/* Send a message through AD service */
function sendMessage(source, dest, message){
  payload = randHex(100) //TEMPORARY
  msg = message + payload //TODO:insert length after command and remove from chunks

  //TODO: add callback
  ads = new ADService()
  ads.sendMessage(source, dest, msg, function(){
    console.log('Message Sent');
  })
}

/* Retrieve messages for Node Nx*/
function receiveMessage (node, sender, msg){
  //ads.getMessages()
};

/****************************************************************************/
var args = process.argv.slice(2);
// if(args < 2){ console.log("Usage: " + __filename + "ASSET_ID NUM_TRANSFERS NUM_RECIPIENTS [WALLET_FILE]");
//     process.exit(-1); }
var cmd = args[0]
var arg1 = args[1]
var arg2 = args[2]
var arg3 = args[3]
var arg4 = args[4]

switch (cmd) {
  case 'newnode':
    var name = arg1
    if(!name){ //{TODO: assign random name} ?
       console.log("Syntax: newnode [NAME]"); process.exit(0);
    }

    // options = {network: 'testnet'}
    createADNode(name);
    break;

  case 'getstatus':
    var name = arg1
    if(!name){
       console.log("Syntax: getstatus [NAME]"); process.exit(0);
    }

    getNodeStatus(name);
    break;

  case 'sendmessage':
    if(!arg3){
       console.log("Syntax: sendmessage SOURCE DEST MESSAGE [SIGN_KEY]"); process.exit(0);
    }
    var source = arg1
    var dest = arg2
    var msg = arg3
    var key = arg4

    sendMessage(source, dest, msg)

    break;

  default:
    console.log("Syntax: CMD [ARGS]");
    console.log("Commands: 'newnode'");
}
