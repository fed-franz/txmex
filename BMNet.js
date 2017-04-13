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
const BMutils = require('./BMutils')

// var BMS = new BMService({})
const DBG = BMutils.DBG
var BM_NET_FILE = 'bmnet.json'
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
    this.dir = dir
  }

  this.loadBMNet()
}

BMNet.prototype.loadBMNet = function(){
  if(DBG) this.log("Loading nodes...")
  var netDir = this.dir
  var files = fs.readdirSync(netDir)
  var self = this
  files.forEach(function(file){
    var fileData = fs.readFileSync(netDir+'/'+file);
    try {
        var nodeData = JSON.parse(fileData)
        self.addBMNode(nodeData)
    } catch(e) {
        return this.log("ERR: Failed to parse file "+file+". RET:"+e);
    }
  })
}

/* Adds a BMNode to this network */
BMNet.prototype.addBMNode = function(nodeData, NEW){
  if(DBG) this.log("Adding node...")
  //TODO if(id == 'auto') create dynamic id
  this.bmnodes[nodeData.id] = new BMNode(this, nodeData, NEW)
}

/* Returns the node object */
BMNet.prototype.getNode = function(id){
  if(this.bmnodes[id]) return this.bmnodes[id];
  else throw "[BMNet] Invalid ID"
}

/* Return the node ID for a specific BTC address */
BMNet.prototype.getNodeID = function(addr) {
  var nodes = this.bmnodes
  var node = Object.keys(nodes).find(id => nodes[id].getAddr() === addr);
  if(!node) throw "[BMNet] No node corresponds to the given address"
  return node.id
};

/* Return the BTC address of a node */
BMNet.prototype.getNodeAddress = function(id) {
  if(this.bmnodes[id])
    return this.bmnodes[id].getAddr()
  else if(bitcore.Address.isValid(id, this.node.network))
    return id
  else throw "[BMNet] Invalid Node ID or Address"
};

//TODO: mv to BMNode
/*****************************************************************************/
function loadBMNode(){;} //Reads node file
function updateBMNode(name, newData){
  var nodeData = loadBMNode(name);
}

/* Get Node Status */
function getNodeStatus(name){
  var nodeData = loadBMNode(name)
  this.log("Node Data:"+JSON.stringify(nodeData,null,2));

  insight.getUnspentUtxos(nodeData.tstAddr, function(err, utxos){
    if(err) return console.log("ERR (getUnspentUtxos): "+err);

    this.log("utxos:"+JSON.stringify(utxos,null,2));
  });
}
/*****************************************************************************/

/* Send a message through BM service */
//TODO: remove?
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
    this.log('Message Sent');
  })
}

/* Retrieve messages for Node Nx*/
function receiveMessage (node, sender, msg){
  //bms.getMessages()
};

/* Prints log with Node prefix */
BMNet.prototype.log = function(msg){
  return BMutils.log(this.name, msg)
}

module.exports = BMNet;
