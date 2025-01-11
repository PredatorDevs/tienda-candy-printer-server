import { Router } from 'express';
const router = Router();

import { controller } from '../controllers/printers.cjs';

const {
  printCCF,
  validatePrinterConnection,
  printTicketKitchen,
  printTicketPreAccount,
  printPackOff,
  printCFTicket,
  printInternalSaleTicket,
  printDteVoucher,
  printCF,
  testPrinterConnection,
  testNetworkPrinterConnection,
  printTestPage,
  printTestPage2,
  printTestPage3,
  printGuideLines,
  printCharLine,
  printSaleDetailsToNetworkPrinter,
  printLegalizedTicket,
  printSettlementXTicket,
  printSettlementZTicket
} = controller;

router.get('/print-guide-lines', printGuideLines);
router.get('/print-char-line', printCharLine);

router.get('/test-network', testNetworkPrinterConnection);
router.get('/test', testPrinterConnection);
router.post('/validate-connection', validatePrinterConnection);
router.get('/testpage', printTestPage);
router.post('/testpage2', printTestPage2);
router.get('/testpage3', printTestPage3);
router.post('/ccf', printCCF);
router.post('/cf', printCF);
router.post('/cfticket', printCFTicket);
router.post('/internalsaleticket', printInternalSaleTicket);
router.post('/dtevoucher', printDteVoucher);
router.post('/printTicketKitchen', printTicketKitchen);
router.post('/printTicketPreAccount', printTicketPreAccount);
router.post('/printPackOff', printPackOff);

router.post('/print-sale-details-to-network-printer', printSaleDetailsToNetworkPrinter);
router.post('/legalized-ticket', printLegalizedTicket);
router.post('/settlement-x-ticket', printSettlementXTicket);
router.post('/settlement-z-ticket', printSettlementZTicket);

export default router;
