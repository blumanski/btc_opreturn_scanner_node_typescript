import { OpScanner } from './opscanner';
const OpScannerClient = new OpScanner();

OpScannerClient.queueScanner(390076, 1000, true);
