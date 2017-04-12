/* BMNet.js */
'use strict';

//TODO: createNetwork(numNodes)
// module.exports = {
//   addBMNode: addBMNode,
//   receiveMessage: receiveMessage,
//   sendMessage: sendMessage,
// };

var bitcore = require('bitcore-lib')
var explorers = require('bitcore-explorers');
var fs = require('fs');
const BMService = require('./index');
const BMNode = require('./BMNode')
const log = require('./BMutils').log

// var BMS = new BMService({})
var BM_NET_FILE = 'bmnet.json'
const DATA_FLDR = './data'
var tBTC = bitcore.Networks.testnet
var BTC = bitcore.Networks.livenet
var insight = new explorers.Insight(tBTC);
var MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT

/***** Constructor *****/
function BMNet (options, dir){
  if(options){
    this.name = options.name
    this.node = options.node
    this.bus = options.bus
    this.bmnodes = {}
  }

  this.loadBMNet(dir)
}

BMNet.prototype.loadBMNet = function(netDir){
  var self = this
  var files = fs.readdirSync(netDir)
  files.forEach(function(file){
    var fileData = fs.readFileSync(netDir+'/'+file);
    var nodeData = JSON.parse(fileData);
    self.addBMNode(nodeData)
  })
}

BMNet.prototype.addBMNode = function(bmnode){
  var BMNodes = this.bmnodes

  var addr = (this.node.network == tBTC ? bmnode.tstAddr : bmnode.liveAddr)
  BMNodes[addr] = {}
  BMNodes[addr].id = bmnode.name
  BMNodes[addr].bmnode = new BMNode(this, bmnode, addr)
}

BMNet.prototype.getNodeName = function(addr) {
  return this.bmnodes[addr].name
  console.log(this.name);
};

BMNet.prototype.getNodeAddress = function(id) {
  var nodes = this.bmnodes
  return Object.keys(nodes).find(addr => nodes[addr].id === id);
};

/*****************************************************************************/

/* Creates a new Wallet for N nodes (addresses) */
//TODO: mv to BMNode


function loadBMNode(){
  //readADNodeFile
}

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

/*****************************************************************************/

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

module.exports = BMNet;
