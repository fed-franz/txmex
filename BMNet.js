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
  if(!bms) throw "Missing BMService instance"
  if(!name) throw "Missing name"

  this.bms = bms
  this.name = name
  this.bmnodes = {}
  this.dir = dir

  this.loadBMNet()
  if(this.bmnodes.length == 0) throw "Empty network"
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
    } catch(e) { self.log("ERR: Failed to parse file "+file+". RET:"+e); }
  })
}

/* Returns the BMNet status */
BMNet.prototype.getStatus = function(){
  var status = {}
  status.name = this.name

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
  if(!nodeData.id) nodeData.id = this.generateID()
  if(mode == MODE.TMP)
    nodeData.id = this.generateID('TMP')

  this.bmnodes[nodeData.id] = new BMNode(this, nodeData, mode)
  return nodeData.id
}

/* Remove a BMNode of this network */
//TODO: opt MODE.KEEP (keep file)
BMNet.prototype.removeBMNode = function(id){
  if(!this.isBMNodeID(id)) throw "ERR: Invalid ID"

  delete this.bmnodes.id
  this.getNode(id).destroy()
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

// /* Return the current status of a node */
// BMNet.prototype.getNodeStatus = function(id, callback){
//   if(!id) throw "ERR: ID is required"
//   var bmnode = this.getNode(id)
//   if(!bmnode) return callback("Node ID is not valid")
//   return node.getStatus(callback)
// }

/*****************************************************************************/

/* Prints log with Node prefix */
BMNet.prototype.log = function(msg){
  return BMutils.log(this.name, msg)
}

module.exports = BMNet;
