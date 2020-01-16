/**
 * @author Oliver Blum <blumanski@protonmail.com>
 * Scan sususoin blockchain for op_returns
 * There is only one public method, call this from outside like so
 * OpScannerClient.queueScanner(chainHeight, limit, true);
 * This will run as queue and will repeat to run sections until the target height is reached. (start + limit)
 */


declare function require(name: string);

const bitcoreLib = require('bitcore-lib');
const RpcClient = require('bitcoind-rpc');
// model for rpc response
import { RpcResponse } from './models/rpcresponse.model';

export class OpScanner {

  private config = {
    protocol: 'http',
    user: '*****',
    pass: '********',
    host: '127.0.0.1',
    port: '8332',
  };

  private rpc: any;
  private startHeight: number = 390076;
  private defaultLimit: number = 50;
  private CurrentTargetHeight: number = 0;

  constructor() {
    this.rpc = new RpcClient(this.config);
  }

  /**
   * Need to use a queue, rpc through errors otherwise on limits, 40 at a time seems to work fine
   * queue to limit calls to the rpc and avoid errors
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
      if(this.CurrentTargetHeight < (start + 40)) {
        console.log('Completed');
        return 'Complete';
      }
    }

    // have a bit delay to avoid overcrowding the json-rpc
    (async () => { 
        
        await this.delay(300)
          .then(any => {
            this.scanForMessages(start, 40)
              .then(any => {
                this.queueScanner((start + 40), 40);

                // console.log('start -> ', start)
                // console.log('end -> ', (start +40))
                // console.log('TARGET -> ', this.CurrentTargetHeight)
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
      // get blockcount
    let a = this.getblockcount();
    // get blockhash for blockchain start height
    let b = a.then((height: number) => {
      return this.getblockhash(start);
    });
    // get block
    let c = b.then((hash: string) => {
      return this.getblock(hash);
    })

    // Chain the promises
    return Promise.all([a, b, c])
      .then((vars: Array<any>) => {
        // test if all needed array keys exist
        if (vars[0] && vars[1] && vars[2]) {
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
                  // test is array keys exist and not empty
                  if (subs[1]['tx'] && subs[1]['tx'].length > 0) {
                    // foreach through the the array
                    subs[1]['tx'].forEach((value: object, index: number) => {
                      // get raw transaction
                      this.getrawtransaction(value)
                        .then((result: RpcResponse) => {
                          
                          if(result['vout'] && result['vout'].length > 0) {
                            // @todo
                            // needs testing, see if this is always key "vout" or other may other keys too
                            // loop through vout array
                            result['vout'].forEach((vout: object | null) => {
                              // look for scriptPubKey
                              if (vout && vout['scriptPubKey']) {
                                if (vout['scriptPubKey']['asm'] && vout['scriptPubKey']['asm'].substr(0, 9) == 'OP_RETURN') {
                                  // test log
                                  console.log(vout['scriptPubKey']['asm']);
                                  console.log(vout['scriptPubKey']['asm'].substr(10, vout['scriptPubKey']['asm'].length));


                                  // decompress OP_RETURN and decode it


                                  // end decoding it

                                  // next step below

                                  // push the de compressed and decoded string to the opReturn array
                                  //opReturns.push();


                                } // end test for OP_RETURN
                              } // end look for scriptPubKey

                            }); // end foreach

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
        } // end test array
      })
      .catch(error => {
        console.log(error)
      })
    })
    .catch(error => {
      console.log(error);
    }); // end promise
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
