/**
 * @author Oliver Blum <blumanski@protonmail.com>
 * Scan sususoin blockchain for op_returns
 * There is only one public method, call this from outside like so
 * OpScannerClient.queueScanner(chainHeight, limit, true);
 * This will run as queue and will repeat to run sections until the target height is reached. (start + limit)
 */


declare function require(name: string);
const Buffer = require('buffer').Buffer;

const bitcoreLib = require('bitcore-lib');
const RpcClient = require('bitcoind-rpc');
const zlib = require('zlib');
const  yauzl = require("yauzl");
const punycode = require('punycode');
const {gzip, ungzip} = require('node-gzip');
//const pako = require('pako');

// model for rpc response
import { RpcResponse } from './models/rpcresponse.model';

export class OpScanner {

  private config = {
    protocol: 'http',
    user: 'XXXX',
    pass: 'XXXXXX',
    host: '127.0.0.1',
    port: '8332',
  };

  private limit: number = 3;

  private rpc: any;
  private startHeight: number = 390076;
  private defaultLimit: number = 2;
  private CurrentTargetHeight: number = 0;

  constructor() {
    this.rpc = new RpcClient(this.config);
  }

  /**
   * Need to use a queue, rpc threw errors on limits.
   * Error to avoid ->  Error: Bitcoin JSON-RPC: Work queue depth exceeded
   * susucoin.conf is already set a bit higher, in test it is set to 32
   * @param start 
   * @param limit
   * @param boolean 
   */
  public queueScanner(start?: number, limit?: number, setMax?: boolean) {
    // use default if none given
    if (!start) {
      start = this.startHeight;
    }
    // use default if none diven
    if (!limit) {
      limit = this.defaultLimit;
    }

    // At the first call (from outside), it will set the target max range
    if(setMax === true) {
      this.CurrentTargetHeight = (start + limit);
    } else {
      if(this.CurrentTargetHeight < (start + this.limit)) {
        //console.log('Completed');
        return 'Complete';
      }
    }

    // have a bit delay to avoid overcrowding the json-rpc
    (async () => { 
        
        await this.delay(300)
          .then(any => {
            this.scanForMessages(start, this.limit)
              .then(any => {
                this.queueScanner((start + this.limit), this.limit);
              })
          })

    })();

  }

  private delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  }

  /**
   * @param start number -> blockchain height to start scan
   * @param limit number -> optional -> limit, as of "scan next 500"
   */
  private scanForMessages(start: number, limit: number) {

    return new Promise((resolve, reject) => {
          // declare array that will hold all op_returns
          let opReturns = [];
          // start looping through blocks 
          for (let i = start; i <= (start + limit); i++) {
            // start next promise promise chain
            // get block hash
            let a = this.getblockhash(i);
            // get block using the hash
            let b = a.then((hash: string) => {
              return this.getblock(hash);
            });

            Promise.all([a, b])
              .then((subs: Array<any>) => {
                // test if array keys exist
                if (subs[0] && subs[1]) {

                  // console.log('blockhash -> ', subs[0]);
                  // console.log('block -> ', subs[1]);
                  // console.log("\n-----------End first step ----------------\n")
                  
                  // test if array keys exist and not empty
                  if (subs[1]['tx'] && subs[1]['tx'].length > 0) {
                    // foreach through the the array
                    subs[1]['tx'].forEach((value: object, index: number) => {

                      // console.log('tx '+index+' -> ', value);
                      // console.log("\n...............End second step ................\n")

                      // get raw transaction
                      this.getrawtransaction(value)
                        .then((result: RpcResponse) => {

                          // console.log('version -> ', result['version'])
                          // console.log('Raw Transaction -> ', result);
                          // console.log("\n...............End third step ................\n")

                          if(result['vout'] && result['vout'].length > 0) {
                            // @todo
                            // needs testing, see if this is always key "vout" or other may other keys too
                            // loop through vout array
                            let concatOpReturns: Array<any> = new Array();
                            let texid:any;

                            result['vout'].forEach((vout: object | null) => {

                              if(vout.hasOwnProperty('value') && vout['value'] == 0) {
                               //console.log(vout)

                                // look for scriptPubKey
                                if (vout.hasOwnProperty('scriptPubKey')) {
                                  if (vout['scriptPubKey']['asm'] && vout['scriptPubKey']['asm'].substr(0, 9) == 'OP_RETURN') {

                                    console.log('tx '+index+' -> ', value);
                                    console.log(vout['scriptPubKey']['asm'])
                                    console.log('dehexed -> ', this.hex2a(vout['scriptPubKey']['asm'].substr(10, vout['scriptPubKey']['asm'].length)))

                                    // attempt to create buffer for gunzip
                                    let buff = Buffer.from(vout['scriptPubKey']['asm'].substr(10, vout['scriptPubKey']['asm'].length), 'hex');
                                    // add to array
                                    concatOpReturns.push(buff);


                                  } // end test for OP_RETURN
                                } // end look for scriptPubKey
                                }
                            }); // end foreach
                            
                            console.log('concat -> ', concatOpReturns)

                            let buffer: any;
                            if(concatOpReturns.length > 0) {
                              // concat buffer
                              buffer = Buffer.concat(concatOpReturns);
                              // gunzip buffer
                              this.decodeOpReturn(buffer);
                            }

                            resolve(true);

                          } // end test array before loop

                        })
                        .catch(error => {
                          console.log(error);
                        });
                    });

                  } // end testing tx
                } // end test if array keys exist

              })
              .catch(error => {
                console.log(error);
              })

          } // end loop 1

    })
    .catch(error => {
      console.log(error);
    }); // end promise
  }

  private decodeOpReturn(buffer: any) {

    zlib.gunzip(buffer, (err, dezipped) => {
      console.log(err)
      if(!err && dezipped) {
        console.log(dezipped.toString('utf8'));
      }
      
    });

    //  const zipFile = yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
    //   console.log(err)
    //   console.log(zipFile)
    //  });
     
   // console.log("\n buffer concate -> ", buffer)
    // zlib.gunzip(buffer, (err, dezipped) => {
    //   console.log('error -> ', err)
    //   //console.log(dezipped);
    // });

  }


  private hex2a(hexx: any) {
    let hex = hexx.toString();
    let str = '';
    for (let i = 0; (i < hex.length && hex.substr(i, 2) !== '00'); i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
  }

  // ------------------------------- Promises Wrapper to avoid pyramid of doom -------------------------------
  
  /**
   * Get blockcount
   */
  private getblockcount() {
    return new Promise((resolve: any, reject: any) => {
      this.rpc.getblockcount((error, response: RpcResponse) => {
        if (!error && response.result) {
          resolve(response.result);
        } else {
          reject(error);
        }
      })
    }).catch(error => {
      console.log('error -> ', error);
    })
  }

  /**
   * @param start Get block hash
   */
  private getblockhash(start: number) {
    return new Promise((resolve: any, reject: any) => {
      this.rpc.getblockhash(start, (error, response: RpcResponse) => {
        if (!error && response.result) {
          resolve(response.result);
        } else {
          reject(error);
        }
      })
    });
  }

  /**
   * Get block
   * @param hash string 
   */
  getblock(hash: string) {
    return new Promise((resolve: any, reject: any) => {
      this.rpc.getblock(hash, (error, response: RpcResponse) => {
        if (!error && response.result) {
          resolve(response.result);
        } else {
          reject(error);
        }
      })
    });
  }

  /**
   * @param f string  get raw transaction
   */
  getrawtransaction(f: object | null) {
    return new Promise((resolve: any, reject: any) => {
      this.rpc.getrawtransaction(f, 1, (error, response: RpcResponse) => {
        if (!error && response.result) {
          resolve(response.result);
        } else {
          reject(error);
        }
      })
    });
  }

}
