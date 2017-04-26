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
function BMNet(bm, options){
  if(!bm) throw "Missing BM instance"
  if(!options) throw "Missing options"

  this.bm = bm
  this.bmnodes = {}

  this.loadBMNet()
  if(this.bmnodes.length == 0) throw "Empty network"
}

/* Load nodes data frome file */
BMNet.prototype.loadBMNet = function(){
if(DBG) this.log("Loading nodes...")
  var dir = this.bm.dir
  var files = fs.readdirSync(dir)
  var self = this
  files.forEach(function(file){
    /* Read .dat files */
    if(BMutils.getFileExtension(file) == 'dat')
      try {
          var nodeData = BMutils.loadObject(dir+'/'+file)
          self.addBMNode(nodeData, MODE.DEFAULT)
      } catch(e) { self.log("ERR: Failed to load "+file+": "+e); }
  })
}

/* Returns the BMNet status */
BMNet.prototype.getStatus = function(){
  var status = {}
  status.name = this.bm.name

  var nodes = []
  for(var id in this.bmnodes)
    nodes.push({id:id, address: this.bmnodes[id].addr})

  status.nodes = nodes

  return status
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
  if(!nodeData.id){
    if(mode == MODE.TMP) nodeData.id = this.generateID('TMP')
    else nodeData.id = this.generateID()
  }

  var node = new BMNode(this, nodeData, mode)
  this.bmnodes[nodeData.id] = node
  return {id:node.id, address:node.addr}
}

/* Remove a BMNode of this network */
//TODO: opt MODE.KEEP (keep file)
BMNet.prototype.removeBMNode = function(id){
  if(!this.isBMNodeID(id)) throw "ERR: Invalid ID"

  this.getNode(id).destroy()
  delete this.bmnodes[id]
}

/* Returns the node object */
BMNet.prototype.getNode = function(id){
  if(!id) throw "ERR: ID is required"
  if(this.bmnodes[id]) return this.bmnodes[id];
  else return null
}

/* Return the node ID for a specific BTC address */
BMNet.prototype.getNodeID = function(addr){
  if(!addr) throw "ERR: addr is required"
  for(var id in this.bmnodes)
    if(this.bmnodes[id].getAddr() == addr) return id
  return null
};

/* Return the BTC address of a node */
BMNet.prototype.getNodeAddress = function(id){
  if(!id) throw "ERR: ID is required"
  if(this.isBMNodeAddr(id)) return id
  if(this.bmnodes[id])
    return this.bmnodes[id].getAddr()
  return null
};

/* Returns true if 'node' corresponds to a node (ID/address) in this network */
BMNet.prototype.isBMNode = function(node){
  if(this.isBMNodeAddr(node) || this.isBMNodeID(node)) return true
  return false
}

/* Returns true if the ID corresponds to a node in this network */
BMNet.prototype.isBMNodeID = function(id){
  if(this.getNode(id)) return true
  return false
}

/* Returns true if the address corresponds to a node in this network */
BMNet.prototype.isBMNodeAddr = function(addr){
  if(this.getNodeID(addr)) return true
  return false
}

/*****************************************************************************/

/* Prints log with Node prefix */
BMNet.prototype.log = function(msg){
  return BMutils.log(this.bm.name, msg)
}

module.exports = BMNet;
