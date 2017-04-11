/* BMNet.js */

//TODO: createNetwork(numNodes)
// module.exports = {
//   addBMNode: addBMNode,
//   receiveMessage: receiveMessage,
//   sendMessage: sendMessage,
// };

var bitcore = require('bitcore-lib')
var explorers = require('bitcore-explorers');
var fs = require('fs');
var BMService = require('./index');
// var apigp = require('./APIgetpost-lib')

// var BMS = new BMService({})
var BM_NET_FILE = 'bmnet.json'
const DATA_FLDR = './data'
var tBTC = bitcore.Networks.testnet
var BTC = bitcore.Networks.livenet
var insight = new explorers.Insight(tBTC);
var MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT
var RUNNING_NODE

function loadBMNode(bmnode){
  var BMNodes = this.bmnodes

  var addr = (this.node.network == tBTC ? bmnode.tstAddr : bmnode.liveAddr)
  BMNodes[addr] = {}
  BMNodes[addr].name = bmnode.name

  var params = {node:this.node, id:bmnode.name, addr: addr, bus: this.bus}
  BMNodes[addr].bmnode = new BMNode(params, bmnode.privKey)
}

function loadBMNet(netDir){
  files = fs.readdirSync(netDir)
  files.forEach(function(file){
    var fileData = fs.readFileSync(netDir+'/'+file);
    var nodeData = JSON.parse(fileData);
    loadBMNode(nodeData)
  }
}

/***** Constructor *****/
function BMNet (options, load){
  if(options){
    this.name = options.name
    this.node = options.node
    this.bus = options.bus
    this.bmnodes = {}
  }

  if(load){
    loadBMNet(options.dir)
  }

  // return this
}

BMNet.prototype.foo = function foo() {
  console.log(this.name);
};

//TODO: replace with one BMNet file with all nodes
function saveBMNode(nodeData){
  if (!fs.existsSync(DATA_FLDR))
    fs.mkdirSync(DATA_FLDR);

  fs.writeFileSync(DATA_FLDR+nodeData.name+".dat", JSON.stringify(nodeData, null, 2));
  //TODO: if addr start with m save to testnet
}

/*****************************************************************************/
BMNet.prototype.addBMNode = function(bmnode){
  BMNodes = this.bmnodes
  /* Select addres */
  var addr = (this.node.network == tBTC ? bmnode.tstAddr : bmnode.liveAddr)
  BMNodes[addr] = {}
  BMNodes[addr].name = bmnode.name

  var params = {node:self.node, id:bmnode.name, addr: addr, bus: self.bus}
  BMNodes[addr].bmnode = new BMNode(params, bmnode.privKey)
}

/* Creates a new Wallet for N nodes (addresses) */
function createBMNode(name, tmp){
  var privKey = new bitcore.PrivateKey();
  var privKeyWIF = privKey.toWIF();
  // var publicKey = privKey.toPublicKey();
  var tBTCAddress = privKey.toAddress(tBTC);
  var BTCAddress = privKey.toAddress(BTC);

  var BMNode = {
    "name": name,
    "privKey": privKeyWIF,
    "tstAddr": tBTCAddress.toString(),
    "liveAddr": BTCAddress.toString(),
  }

  if(!tmp)
    saveBMNode(BMNode)

  return BMNode
}//createBMNode

function updateBMNode(name, newData){
  var nodeData = loadBMNode(name);
}

/* Get Node Status */
function getNodeStatus(name){
  var nodeData = loadBMNode(name)
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
function addNode(node){

}
/* Create new Node */


/* Send a message through BM service */
function sendMessage(source, dest, message, key){
  // payload = randHex(100) //TEMPORARY
  msg = message //+ payload //TODO:insert length after command and remove from chunks

  bms = new BMService()

  if(!source){
    var tmpNode = createBMNode()
    source = tmpNode.name
    bms.loadNode(tmpNode)
  } //Create a new address


  //TODO: add callback

  bms.sendMessage(source, dest, msg, key, function(){
    console.log('Message Sent');
  })
}

/* Retrieve messages for Node Nx*/
function receiveMessage (node, sender, msg){
  //bms.getMessages()
};

/****************************************************************************/
/*
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
    createBMNode(name);
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

/* Create new Bitcoin address
function createBitcoinAddress(BCnet){
  var privKey = new bitcore.PrivateKey();
  var privKeyWIF = privKey.toWIF();

  if(BCnet == BTC)
    var newAddr = privKey.toAddress(BTC);
  else
    var newAddr = privKey.toAddress(tBTC);

  var BTCAddr = {
    "key": privKeyWIF,
    "addr": newAddr.toString(),
  }
}
*/
module.exports = BMNet;
