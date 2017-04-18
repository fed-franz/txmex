/* BMNet.js */
'use strict';

//TODO: createNetwork(numNodes)

var bitcore = require('bitcore-lib')
var explorers = require('bitcore-explorers');
var fs = require('fs');
const BMService = require('./index');
const BMNode = require('./BMNode')
const BMutils = require('./BMutils')

const MODE = BMutils.MODE
const DBG = BMutils.DBG
var BM_NET_FILE = 'bmnet.json'
var tBTC = bitcore.Networks.testnet
var BTC = bitcore.Networks.livenet
var insight = new explorers.Insight(tBTC);
var MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT

/***** Constructor *****/
function BMNet (bms, name, dir){
  if(name){
    this.name = name
    this.bms = bms
    this.bmnodes = {}
    this.dir = dir

    this.loadBMNet()
  }
  else{ //TODO: create new network
    throw "No name provided"
  }
}

/* Load nodes data frome file */
BMNet.prototype.loadBMNet = function(){
  if(DBG) this.log("Loading nodes...")
  var netDir = this.dir
  //TODO: if(this.dir) does not exist...
  var files = fs.readdirSync(netDir)
  var self = this
  files.forEach(function(file){
    //TODO: if *.dat
    var fileData = fs.readFileSync(netDir+'/'+file);
    try {
        var nodeData = JSON.parse(fileData)
        self.addBMNode(nodeData)
    } catch(e) {
        return this.log("ERR: Failed to parse file "+file+". RET:"+e);
    }
  })
}

/* Creates a new dynamic node ID */
BMNet.prototype.generateID = function(base){
  if(!base) base = 'N'
  var maxn = 1

  for(var id in this.bmnodes){
    if(id.startsWith(base)){
      var idnum = id.substring(base.length,id.length)
      if(BMutils.isNum(idnum) && idnum >= maxn) maxn = parseInt(idnum)+1
    }
  }

  return base+maxn
}

/* Adds a BMNode to this network */
BMNet.prototype.addBMNode = function(nodeData, mode){
  var id = nodeData.id
  if(id == 'auto') nodeData.id = id = this.generateID()
  if(id == 'temp'){
    nodeData.id = id = this.generateID('TMP')
    mode = MODE.TMP
  }

  this.bmnodes[id] = new BMNode(this, nodeData, mode)
  return id
}

/* Remove a BMNode of this network */
//TODO: opt MODE.KEEP (keep file)
BMNet.prototype.removeBMNode = function(id){
  if(!this.isBMNodeID(id)) throw "ERR: Invalid ID"

  delete this.bmnodes.id
  this.getNode(id).destroy()
}

/* Returns true if 'node' corresponds to a node (ID/address) in this network */
BMNet.prototype.isBMNode = function(node){
  if(this.getNodeAddress(node) || this.isBMNodeID(node)) return true
  return false
}

/* Returns true if the ID corresponds to a node in this network */
BMNet.prototype.isBMNodeID = function(id){
  if(this.getNodeAddress(id)) return true
  return false
}

/* Returns true if the address corresponds to a node in this network */
BMNet.prototype.isBMNodeAddr = function(addr){
  if(this.getNodeID(addr)) return true
  return false
}

/* Returns the node object */
BMNet.prototype.getNode = function(id){
  if(this.bmnodes[id]) return this.bmnodes[id];
  else return null
}

/* Return the node ID for a specific BTC address */
BMNet.prototype.getNodeID = function(addr) {
  var nodes = this.bmnodes
  for(var id in this.bmnodes)
    if(this.bmnodes[id].getAddr() == addr) return id
  return null
};

/* Return the BTC address of a node */
BMNet.prototype.getNodeAddress = function(id) {
  if(this.bmnodes[id])
    return this.bmnodes[id].getAddr()
  else if(bitcore.Address.isValid(id, this.bms.node.network))
    return id
  else return null
};

//TODO: mv to BMNode
/*****************************************************************************/
function loadBMNode(){;} //Reads node file
function updateBMNode(name, newData){
  var nodeData = loadBMNode(name);
}

/*****************************************************************************/

/* Prints log with Node prefix */
BMNet.prototype.log = function(msg){
  return BMutils.log(this.name, msg)
}

module.exports = BMNet;
