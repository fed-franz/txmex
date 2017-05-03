/* TMNet.js */
'use strict';

var fs = require('fs');
const TMNode = require('./TMNode')
const TMutils = require('./TMutils')

const MODE = TMutils.MODE

/***** Constructor *****/
//TODO: add 'options' parameter {numnodes}
function TMNet(tm){
  if(!tm) throw "Missing TM instance"

  this.tm = tm
  this.tmnodes = {}
  this.log = this.tm.tms.log

  this.loadTMNet()
}

/* Load nodes data frome file */
TMNet.prototype.loadTMNet = function(){
  var dir = this.tm.dir
  var files = fs.readdirSync(dir)
  var self = this

  /* Read node files (.dat) in the data folder */
  files.forEach(function(file){
    if(TMutils.getFileExtension(file) == 'dat')
      try {
          var nodeData = TMutils.loadObject(dir+'/'+file)
          self.addTMNode(nodeData, MODE.DEFAULT)
      } catch(e) { self.log.warn("Failed to load "+file+": "+e); }
  })

  this.log.info("'"+this.tm.name+"' network loaded")
  if(Object.keys(this.tmnodes).length == 0)
    this.log.warn("Network is empty")

}

/* Returns the status of the network */
TMNet.prototype.getStatus = function(){
  var status = {}
  status.name = this.tm.name

  status.nodes = []
  for(var id in this.tmnodes)
    status.nodes.push({id:id, address: this.tmnodes[id].addr})

  return status
}

/* Creates a new dynamic node ID */
TMNet.prototype._generateID = function(base){
  if(!base) base = 'N'
  var maxn = 1

  for(var id in this.tmnodes){
    if(id.startsWith(base)){
      var idnum = id.substring(base.length,id.length)
      if(TMutils.isNum(idnum) && idnum >= maxn) maxn = parseInt(idnum)+1
    }
  }

  return base+maxn
}

/* Adds a TMNode to this network */
TMNet.prototype.addTMNode = function(nodeData, mode){
  if(!nodeData.id){
    if(mode == MODE.TMP) nodeData.id = this._generateID('TMP')
    else nodeData.id = this._generateID()
  }

  var node = new TMNode(this, nodeData, mode)
  this.tmnodes[nodeData.id] = node
  return {id:node.id, address:node.addr}
}

/* Remove a TMNode of this network */
//TODO: opt MODE.KEEP (keep file)
TMNet.prototype.removeTMNode = function(id){
  if(!this.isTMNodeID(id)) throw "ERR: Invalid ID"

  this.getNode(id).destroy()
  delete this.tmnodes[id]
}

/* Returns the node object */
TMNet.prototype.getNode = function(id){
  if(!id) throw "ERR: ID is required"
  if(this.tmnodes[id]) return this.tmnodes[id];
  else return null
}

/* Return the node ID for a specific BTC address */
TMNet.prototype.getNodeID = function(addr){
  if(!addr) throw "ERR: addr is required"
  for(var id in this.tmnodes)
    if(this.tmnodes[id].getAddr() == addr) return id
  return null
};

/* Return the BTC address of a node */
TMNet.prototype.getNodeAddress = function(id){
  if(!id) throw "ERR: ID is required"
  if(this.isTMNodeAddr(id)) return id
  if(this.tmnodes[id])
    return this.tmnodes[id].getAddr()
  return null
};

/* Returns true if 'node' corresponds to a node (ID/address) in this network */
TMNet.prototype.isTMNode = function(node){
  if(this.isTMNodeAddr(node) || this.isTMNodeID(node)) return true
  return false
}

/* Returns true if the ID corresponds to a node in this network */
TMNet.prototype.isTMNodeID = function(id){
  if(this.getNode(id)) return true
  return false
}

/* Returns true if the address corresponds to a node in this network */
TMNet.prototype.isTMNodeAddr = function(addr){
  if(this.getNodeID(addr)) return true
  return false
}

/*****************************************************************************/

module.exports = TMNet;
