'use strict';

const bitcore = require('bitcore-lib')
const explorers = require('bitcore-explorers')
const fs = require('fs')
// const tBTC = bitcore.Networks.testnet
// const BTC = bitcore.Networks.livenet

module.exports = {
  log: prefixLog,
  isNum: isNum,
  hexToAscii: hexToAscii,
  getBTCNetwork: getBTCNetwork,
  createBTCKey: createBTCKey,
  getBTCAddr: getBTCAddr,
  isValidAddr: isValidAddr,
  getBTCAddrBalance: getBTCAddrBalance,
  chunkMessage: chunkMessage,
  assembleChunks: assembleChunks,
  existsFileDir: existsFileDir,
  createDirectory: createDirectory,
  getFileExtension: getFileExtension,
  saveObject: saveObject,
  loadObject: loadObject
};

module.exports.DBG = true
module.exports.MODE = {
  DEFAULT: 1,
  NEW : 2,
  TMP : 3
}

/* Prints log with BM prefix */
function prefixLog(prefix, msg){
  return console.log('['+prefix+'] '+msg);
}

/* Save an object to file */
function saveObject(dir, name, data){
  /* Write to disk */
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir);
  fs.writeFileSync(dir+'/'+name, JSON.stringify(data, null, 2));
}

/* Read object from file */
function loadObject(fname){
  if (!fs.existsSync(fname)) throw "ERR: filename does not exist"

  var fileData = fs.readFileSync(fname);
  var obj = JSON.parse(fileData);
  return obj
}

/* Returns the extension of a file */
function getFileExtension(fname){
  return fname.substr((~-fname.lastIndexOf(".") >>> 0) + 2);
}

/* Return true is filename exists */
function existsFileDir(fname){
 return fs.existsSync(fname)
}

function createDirectory(dir){
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir);
}

/* Split message 'str' in chunks of 'size' letters */
function chunkMessage(str, size) {
  var numChunks = Math.ceil(str.length / size),
      chunks = new Array(numChunks);

  for(var i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size);
  }

  return chunks;
}

/* Put chunks together */ //TODO: mv to BMutils as a general function
function assembleChunks(chunks){
  var str = ""
  for(var i=0; i<chunks.length; i++){
      str += chunks[i]
  }

  return str
}

/* Convert hex string to ASCII */
function hexToAscii (str1){
  var hex  = str1.toString();
  var str = '';
  for (var n = 0; n < hex.length; n += 2)
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));

  return str;
}

/* TEMP */
function randHex(length) {
  var chars = '0123456789abcdef';
  var result = '';
  for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];

  return result;
}

/* Check if 'num' is a number */
function isNum(num){
    return !isNaN(num)
}

/*__________ BITCOIN __________*/

/* Create new Bitcoin address */
function createBTCKey(){
  return new bitcore.PrivateKey().toWIF();
}

/* Returns the address for the key */
function getBTCAddr(privKey, BTCnet){
  var pk = new bitcore.PrivateKey(privKey)
  return pk.toAddress(BTCnet).toString()
}

function isValidAddr(addr, net){
  return bitcore.Address.isValid(addr, net)
}

function getBTCNetwork(addr){
  var addrObj = new bitcore.Address(addr)
  return addrObj.network
}

function getBTCAddrBalance(addr, callback){
  var network = getBTCNetwork(addr)
  var insight = new explorers.Insight(network)

  insight.getUnspentUtxos(addr, function(err, utxos){
    if(err) return callback(err)

    var balance = 0
    for(var i in utxos)
      balance += utxos[i].satoshis

    return callback(null, balance)
  });
}
