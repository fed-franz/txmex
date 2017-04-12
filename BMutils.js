const bitcore = require('bitcore-lib')
const tBTC = bitcore.Networks.testnet
const BTC = bitcore.Networks.livenet

module.exports = {
  log: log,
  hexToAscii: hexToAscii,
  getKeyByValue: getKeyByValue,
  createBTC: createBTC,
  getBTCAddr: getBTCAddr,
};


/* Prints log with BM prefix */
function log(msg){
  return console.log('[BM] '+msg);
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

/* Return the key of a value in a dictionary */
function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

/*__________ BITCOIN __________*/

/* Returns the address for the key */
function getBTCAddr(privKey, BTCnet){
  privKey.toAddress(BTCnet).toString()
}

/* Create new Bitcoin address */
function createBTC(){
  var privKey = new bitcore.PrivateKey();

  return {
    "key": privKey.toWIF(),
    "addr": getBTCAddr(privKey, tBTC)
    "tAddr": getBTCAddr(privKey, tBTC)
  }
}
