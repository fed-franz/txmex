var BMNode = require('./BMNode')
var BMNet = require('./BMNet')

const TX_PREFIX = "BM"
const BMutils = require('./BMutils');
const hexToAscii = BMutils.hexToAscii

/* Extract embedded data from TX output */
/**
 * @param {bitcore.Transaction} tx
 * @param {Number} index - index of transaction output to extract data from
 */
var getTxData = function(tx, index){
  var txOut = tx.outputs[index-1]
  if(!txOut) return null

  /* Get script for the 2nd output */
  var script = txOut.script
  if(!script.isDataOut()) return null

  /* Decode */
  var msgsplit = script.toString().split(" ")
  var msgcode = msgsplit[msgsplit.length-1]
  var data = hexToAscii(msgcode)

  return data
}

/* Check 'tx' for BM messages */
var isBMTransaction = function(tx){
  if(tx.tx) tx = tx.tx

  if(tx.outputs.length < 2) return false

  /* Get script for the 2nd output */
  var data = getTxData(tx, 2)
  if(!data) return false

  /* Verify BM prefix */
  var BMcode = data.substring(0,3)
  if(BMcode.localeCompare(TX_PREFIX) != 0) return false

  return true
}//isBMTransaction()

/* Extract the embedded message (if any) */
var getBMMessage = function(tx){
  if(tx.tx) tx = tx.tx

  if(!isBMTransaction(tx)) return null

  var msgsplit = tx.outputs[1].script.toString().split(" ")
  var data = hexToAscii(msgsplit[msgsplit.length-1])

  var msglen = parseInt(data.charAt(3), 16);
  var msgseq = parseInt(data.charAt(4), 16);
  var msg = data.slice(5)

  return {'seq':msgseq, 'len':msglen, 'msg':msg}
}

/**/
module.exports = {
  isBMTransaction: isBMTransaction,
  getMessage: getBMMessage,
};
