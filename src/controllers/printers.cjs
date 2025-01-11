const escpos = require('escpos');
const ReceiptPrinterEncoder = require('@point-of-sale/receipt-printer-encoder');
let SystemReceiptPrinter = require('@point-of-sale/system-receipt-printer');

// const { exec } = require('child_process');

const dayjs = require('dayjs');
const fs = require('fs');
const ping = require('ping');
const { exec, spawn } = require('child_process');
// install escpos-usb adapter module manually

escpos.USB = require('escpos-usb');
escpos.Network = require('escpos-network');

// Select the adapter based on your printer type
// const device  = new escpos.USB(vId, pId);

// const device  = new escpos.Serial('/dev/usb/lp0');

// encoding is optional

const escposcommands = {
  alternativeCut: [0x1B, 0x69],
  alternativeAlignToLeft: [0x1D, 0x56, 0x40],
  alternativeAlignToCenter: [0x1D, 0x56, 0x41],
  alternativeAlignToRight: [0x1D, 0x56, 0x42],
  alignToLeft: [0x1B, 0x61, 0x00],
  alignToCenter: [0x1B, 0x61, 0x01],
  alignToRight: [0x1B, 0x61, 0x02],
  setFontTypeA: [0x1B, 0x21, 0x00],
  setFontTypeB: [0x1B, 0x21, 0x01]
};

const controller = {};

const vId = "8137";
const pId = "8214";

const matrix_vId = "1203";
const matrix_pId = "17717";

controller.printTicketKitchen = async (req, res) => {
  try {
    const { ticketBody } = req.body;
    const { orderDetails, orderInfo, ticketName, date, time } = ticketBody;

    const networkDevices = {};

    const groupProductsByLocation = (orderDetails) => {
      const ubicationsProducts = {};
      orderDetails.forEach(obj => {
        const { ubicationId, ubicationName, printerIP, printerPORT } = obj;

        if (!(ubicationId in ubicationsProducts)) {
          ubicationsProducts[ubicationId] = {};
        }

        if (!(printerIP in ubicationsProducts[ubicationId])) {
          ubicationsProducts[ubicationId][printerIP] = {
            id: ubicationId,
            name: ubicationName,
            ip: printerIP,
            port: printerPORT,
            products: []
          };

          networkDevices[printerIP] = new escpos.Network(printerIP, printerPORT);
        }

        ubicationsProducts[ubicationId][printerIP].products.push(obj);
      });
      return ubicationsProducts;
    };

    const openPrinterConnections = async (networkDevices) => {
      await Promise.all(Object.values(networkDevices).map(networkDevice => {
        return new Promise((resolve, reject) => {
          networkDevice.open(function (error) {
            if (error) {
              console.error('Error al abrir la conexión con la impresora:', error);
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }));
    };

    const closePrinterConnections = async (networkDevices) => {
      await Promise.all(Object.values(networkDevices).map(networkDevice => {
        return new Promise(resolve => {
          networkDevice.close(resolve);
        });
      }));
    };

    const ubicationsProducts = groupProductsByLocation(orderDetails);
    await openPrinterConnections(networkDevices);

    for (const ubicationId in ubicationsProducts) {
      if (ubicationsProducts.hasOwnProperty(ubicationId)) {
        const ips = Object.keys(ubicationsProducts[ubicationId]);

        for (const ip of ips) {
          const { id, name, ip: printerIP, port: printerPORT, products } = ubicationsProducts[ubicationId][ip];
          const printer = new escpos.Printer(networkDevices[ip], { encoding: "GB18030", width: 56 });

          printer
            .font('A')
            .align('LT')
            .style('NORMAL')
            .size(0, 0)
            .text('-----------------------------------------')
            .style('B')
            .text(`Asados El Flaco`)
            .style('NORMAL')
            .text('-----------------------------------------')
            .text(`PARA ${name} ${orderInfo[0].orderTypeId === 2 ? '(A DOMICILIO)' : orderInfo[0].orderTypeId === 3 ? '(PARA LLEVAR)' : ''}`)
            .text(`FECHA: ${date}          HORA: ${time}`)
            .feed(1)
            .text(`Ticket No. ${orderInfo[0].TicketNo}`)
            .text(`${orderInfo[0].fullName}`)
            .feed(1)
            .text(`${orderInfo[0].name}`)
            .text('-----------------------------------------');

          for (const product of products) {
            const { quantity, comments, name } = product;
            const formattedQuantity = parseInt(quantity).toString().padStart(3);
            const formattedComment = comments.trim() !== "" ? `"${comments}"` : '';

            printer
              .style('B')
              .text(`${formattedQuantity}  ${name}`);

            if (formattedComment !== '') {
              printer
                .text(`     ${formattedComment}`);
            }

            printer
              .style('NORMAL');
          }

          printer
            .text('-----------------------------------------')
            .text(`${orderInfo[0].comments}`)
            .text('-----------------------------------------')
            .feed(2)
            .control('FF')
            .cut()
            .close();
        }
      }
    }

    await closePrinterConnections(networkDevices);

    res.json({ data: "Printer connection success!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.printTicketPreAccount = (req, res) => {
  try {

    const { ticketBody } = req.body;
    const { orderDetails, orderInfo, ticketName, date, time } = ticketBody;

    //const networkDevice = new escpos.Network('192.168.1.100', 9100);
    const networkDevice = new escpos.Network('192.168.0.5', 9105);

    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    networkDevice.open(function (error) {

      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .style('B')
        .text(`           P R E C U E N T A`)
        .style('NORMAL')
        .text('-----------------------------------------')
        .text(`Empleado(a): ${orderInfo.fullName}`)
        .text(`FECHA: ${date}            HORA: ${time}`)
        .feed(1)
        .text(`Ticket No. ${orderInfo.TicketNo}`)
        .text(`${orderInfo.Client}`)
        .text('-----------------------------------------')

      for (let i = 0; i < orderDetails.length; i++) {
        const { quantity, name, totalDetail } = orderDetails[i];
        const formattedQuantity = parseInt(quantity).toString().padStart(3); // Asegura que la cantidad tenga una longitud fija
        const formattedTotal = parseFloat(totalDetail).toFixed(2); // Asegura que el total tenga una longitud fija

        printer
          .style('B')
          .text(`${formattedQuantity}  ${name}          $${formattedTotal}`)
          .style('NORMAL');
      }

      printer
        .text('-----------------------------------------')
        .style('B')
        .text(`Total a Pagar:                 $${parseFloat(orderInfo.total).toFixed(2)}`)
        .style('NORMAL');

      printer
        .feed(2)
        .control('FF')
        .cut()
        .close((err) => {
          if (err) {
            res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
          } else {
            res.json({ data: "Printer connection success!" });
          }
        });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.printPackOff = (req, res) => {
  try {

    const { ticketBody } = req.body;
    const { orderDetails, clientInfo, orderInfo, ticketName, date, time } = ticketBody;
    const networkDevice = new escpos.Network('192.168.1.100', 9100);

    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    networkDevice.open(function (error) {

      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
        .font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .text('-----------------------------------------')
        .style('B')
        .text(`Asados El Flaco`)
        .style('NORMAL')
        .text('-----------------------------------------')
        .text(`Empleado(a): ${orderInfo.fullName}`)
        .text(`FECHA: ${date}            HORA: ${time}`)
        .feed(1)
        .text(`Ticket No. ${orderInfo.TicketNo}`)
        .text(`${orderInfo.Client}`)
        .feed(2)
        .text(`Direccion: ${clientInfo.FullAddress}`);

      if (clientInfo.reference !== '') {
        printer
          .text(`Referencias: ${clientInfo.reference}`);
      }

      printer
        .text(`DUI: ${clientInfo.dui}`)
        .text(`Telefono: ${clientInfo.phoneNumber}`);

      if (orderInfo.comments !== '') {
        printer
          .text(`Indicaciones Adicionales: ${orderInfo.comments}`)
      }

      printer
        .text('-----------------------------------------');

      for (let i = 0; i < orderDetails.length; i++) {
        const { quantity, name, totalDetail } = orderDetails[i];
        const formattedQuantity = parseInt(quantity).toString().padStart(3); // Asegura que la cantidad tenga una longitud fija
        const formattedTotal = parseFloat(totalDetail).toFixed(2); // Asegura que el total tenga una longitud fija

        printer
          .style('B')
          .text(`${formattedQuantity}  ${name}          $${formattedTotal}`)
          .style('NORMAL');
      }

      printer
        .text('-----------------------------------------')
        .style('B')
        .text(`Total a Pagar:                 $${parseFloat(orderInfo.total).toFixed(2)}`)
        .style('NORMAL');

      printer
        .feed(2)
        .control('FF')
        .cut()
        .close((err) => {
          if (err) {
            res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
          } else {
            res.json({ data: "Printer connection success!" });
          }
        });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
};

controller.testNetworkPrinterConnection = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    // const networkDevice = new escpos.Network('127.0.0.1', 9105);
    const networkDevice = new escpos.Network('192.168.1.100', 9100);

    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    const remoteAddress = req.headers['x-real-ip'] || req.connection.remoteAddress;

    networkDevice.open(function(error){
      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
      .font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .text(`You are printing from ${remoteAddress || ''}`)
      .text(`Prueba SigPro`)
      .control('FF')
      .cut()
      .close((err) => {
        if (err) {
          res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
        } else {
          res.json({ data: "Printer connection success!" });
        }
      });
    });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.testPrinterConnection = (req, res) => {
  try {
    console.log(escpos.USB.findPrinter());
    // console.log(escpos.Win());

    // const device  = new escpos.;
    const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);

    // const device = new escpos.Parallel('LPT3');

    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    device.open(function (error) {
      printer.close((err) => {
        if (err) {
          res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
        } else {
          res.json({ data: "Printer connection success!" });
        }
      });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.testCashdrawerOpenAction = (req, res) => {
  try {
    const device = new escpos.USB(vId, pId);
    const options = { encoding: "GB18030", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    device.open(function(error){
      printer
      // .feed(2)
      .cashdraw(2)
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.validatePrinterConnection = async (req, res) => {
  try {
    const { ip, port } = req.body;

    const printerOnline = await checkPrinterOnline(ip);

    if (printerOnline) {
      res.status(200).json({ message: 'Printer Ready to Work!' });
    } else {
      res.status(400).json({ error: 'Printer not found!' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Printer not found!' });
  }
};

async function checkPrinterOnline(ipAddress) {
  try {
    const res = await ping.promise.probe(ipAddress);
    return res.alive;
  } catch (error) {
    console.error('Error al ejecutar ping:', error);
    return false;
  }
}

controller.printTestPage = (req, res) => {
  try {
    const commands = '\x1B\x40Hello ESC/POS\n\x1D\x56\x00'; // Comandos ESC/POS
    const printerPath = '\\\\Luciernaga\\Epson TM-U950 Receipt';

    // Crea un archivo temporal con los comandos ESC/POS
    const tempFile = 'temp_comandos.txt';
    fs.writeFileSync(tempFile, commands, 'binary');

    // Ejecuta el comando copy
    const command = `copy /b ${tempFile} "${printerPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error al imprimir ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`Error ${stderr}`);
        return;
      }
      console.log('Impresor completa');
      return;
    });
    // const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);
    // const device = new escpos.Win('ESDPRT001');
    // console.log(device);

    // const options = { encoding: "GB18030", width: 56 /* default */ }
    // const printer = new escpos.Printer(device, options);

    // const remoteAddress = req.headers['x-real-ip'] || req.connection.remoteAddress;

    // device.open(function(error){
    //   printer
    //   .font('A')
    //   .align('LT')
    //   .style('NORMAL')
    //   .size(0, 0)
    //   .text(`You are printing from ${remoteAddress || ''}`)
    //   .feed(5)
    //   .text('HELLO WORLD')
    //   .feed(2)
    //   .control('FF')
    //   .cut()
    //   .feed(2)
    //   .close((err) => {
    //     if (err) {
    //       res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
    //     } else {
    //       res.json({ data: "Printer connection success!" });
    //     }
    //   });
    // });
    res.json({ data: "Printer connection success!" });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printTestPage2 = (req, res) => {
  try {
    const data = {
      locationName: 'AGROSERVICIO MIGUELENO SA DE CV',
      businessLocationName: 'AGROMISA',
      address: '3ra Calle Oriente 2a Av. Sur Bo. El Calvario San Miguel',
      nrc: '38457-7',
      nit: '1217-010190-102-3',
      businessLine: 'Venta de Productos para Uso Agropecuario',
      resolutionNumber: 'ASC-15041-050863-2023',
      resolutionDate: '01/01/2025',
      authSerie: 'Del 1 al 200000',
      dateTime: '01/01/2025 12:05:24',
      cashierName: 'Caja #1',
      documentNumber: 'TICKET #0032264',
      sellerName: 'ROSARIO',
      cashierOwnerName: 'ROSARIO'
    };

    let encoder = new ReceiptPrinterEncoder({
      language: 'esc-pos',
      columns: 42,
      feedBeforeCut: 0,
      newline: '\n'
    });

    let commands = encoder.initialize()
    // .raw([0x1B, 0x3D, 0x01])
    .raw([0x1B, 0x63, 0x30, 0x03])
    .line('')
    .align('center')
    .line(`${data.locationName}`)
    .line(`${data.businessLocationName}`)
    // .line('')
    .line(`${data.address}`)
    // .line('')
    .line(`${String(`NRC: ${data.nrc}`.padEnd(16))} ${String(`NIT: ${data.nit}`.padEnd(22))}`)
    .align('left')
    .line(`RES: ${data.resolutionNumber}`)
    .line(`FECHA RES: ${data.resolutionDate}`)
    .line(`SERIE AUT: ${data.authSerie}`)
    .align('center')
    .line(`${data.cashierName}`)
    .line(`${data.documentNumber}`)
    // .line('')
    .align('left')
    .line(`${String('Cant').padEnd(9)} ${String('Descripcion').padEnd(19)} ${String('Precio').padStart(9)}`)
    .line('----------------------------------------')
    .line(`${String('10.00').padEnd(9)} ${String('FRIJOLES LA CHULA').padEnd(19)} ${String('16.50').padStart(9)}`)
    .line('----------------------------------------')
    .align('left')
    .line(`VENDEDOR: ${data.sellerName}`.padEnd(39))
    .line(`CAJERO: ${data.cashierOwnerName}`.padEnd(39))
    .line(`${data.dateTime}`.padEnd(39))
    .line('')
    .align('center')
    .line('No se aceptan cambios ni devoluciones sin presentar este ticket')
    .line('')
    .line('*-*-* GRACIAS POR PREFERIRNOS *-*-*')
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .raw(escposcommands.alternativeCut)
    .line('')
    .line('')
    .line('')
    .encode();

    const pcName = 'Luciernaga';
    const printerName = 'Epson TM-U950 Receipt';

    const printerPath = `\\\\${pcName}\\${printerName}`;

    const tempFile = 'comandos_print.bin';
    // const tempFile = 'temp_comandos.txt';
    // const cutCommand = new Uint8Array([0x1B, 0x69]);
    fs.writeFileSync(tempFile, Buffer.from(commands), 'binary');
    // fs.writeFileSync(tempFile, `${commands}`, 'binary');

    const command = `copy /b ${tempFile} "${printerPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error al imprimir ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`Error ${stderr}`);
        return;
      }
      console.log('Impresor completa');
      return;
    });

    res.json({ data: "Printer connection success!" });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printTestPage3 = (req, res) => {
  try {
    const command = `copy /b ${tempFile} "${printerPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error al imprimir ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`Error ${stderr}`);
        return;
      }
      console.log('Impresor completa');
      return;
    });

    res.json({ data: "Printer connection success!", commands });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCCF = (req, res) => {
  try {
    const device = new escpos.USB(matrix_vId, matrix_pId);
    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerState, customerNit, customerNRC, customerBusinessType, taxableSale, totalTaxes, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, taxableSale }]

    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      documentDatetime,
      customerAddress,
      customerState,
      customerNit,
      paymentTypeName,
      customerNrc,
      customerDui,
      customerBusinessType,
      customerDepartmentName,
      taxableSale,
      taxableSaleWithoutTaxes,
      noTaxableSale,
      totalTaxes,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function(error){
      printer
      .font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .marginLeft(3)
      .marginRight(4)
      .feed(7) // LINE 1 - 7
      .feed(2) // LINE 8 - 9
      .tableCustom(
        [
          { text: ``, align: "LEFT", width: 0.75 },
          { text: `${documentDatetime || ''}`, align: "LEFT", width: 0.25 }
        ]
      ) // LINE 10
      .text(`     ${customerFullname.substring(0, 50) || ''}`) // LINE 11 CLIENTE NAME
      .feed(1) // LINEA 12
      .tableCustom(
        [
          { text: `     ${customerAddress.substring(0, 45) || ''}`, align: "LEFT", width: 0.7 },
          { text: `${customerNrc || ''}`, align: 'RIGHT', width: 0.3 }
        ]
      ) // LINE 13
      .tableCustom(
        [
          { text: `         ${customerDepartmentName.substring(0, 31) || ''}`, align: "LEFT", width: 0.60 },
          { text: `${customerBusinessType.substring(0, 19) || ''}`, align: "RIGHT", width: 0.40 }
        ]
      ) // LINE 12
      .tableCustom(
        [
          { text: `         ${customerDui || customerNit || ''}`, align: "LEFT", width: 0.80 },
          { text: `${paymentTypeName || ''}`, align: "RIGHT", width: 0.20 },
        ]
      ) // LINE 13
      .feed(1) // LINE 14
      .tableCustom(
        [
          { text: `    `.substring(0, 26), align: "LEFT", width: 1 }
        ]
      ) // LINE 15
      .feed(3); // LINE 17 - 18
      for (let i = 0; i < invoiceBodyData.length; i++) {
        printer.font('A')
        .align('LT')
        .style('NORMAL')
        .size(0, 0)
        .marginLeft(3)
        .marginRight(5)
        .tableCustom(
          [
            { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.07 },
            { text: `${invoiceBodyData[i].productName || ""}`.substring(0, 35), align: "LEFT", width: 0.57 },
            // { text: "", align: "LEFT", width: 0.11 },
            { text: `${invoiceBodyData[i].unitPriceNoTaxes || 0}`, align: "LEFT", width: 0.11 },
            // { text: `${invoiceBodyData[i].noTaxableSubTotal || ''}`, align: "LEFT", width: 0.13 },
            { text: `${''}`, align: "LEFT", width: 0.15 },
            { text: `${invoiceBodyData[i].taxableSubTotalWithoutTaxes || 0}`, align: "RIGHT", width: 0.11 }
          ]
        );
      }
      printer.font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .marginLeft(3)
      .marginRight(4)
      .feed(14 - +invoiceBodyData.length) // LINE 19 - 36
      .tableCustom(
        [
          { text: `    ${totalToLettersPartOne || ''}`, align: "LEFT", width: 0.50 },
          { text: "", align: "LEFT", width: 0.35 },
          { text: `  ${taxableSaleWithoutTaxes || 0}`, align: "LEFT", width: 0.16 }
        ]
      ) // LINE 38
      .tableCustom(
        [
          { text: `    ${totalToLettersPartTwo || ''}`, align: "LEFT", width: 0.50 },
          { text: "", align: "LEFT", width: 0.35 },
          { text: ``, align: "LEFT", width: 0.16 } // AQUI PUEDE IR EL DESCUENTO
        ]
      ) // LINE 39
      .tableCustom(
        [
          { text: ``, align: "LEFT", width: 0.50 },
          { text: "", align: "LEFT", width: 0.35 },
          { text: `  ${totalTaxes || 0}`, align: "LEFT", width: 0.16 } // AQUI PUEDE IR EL DESCUENTO
        ]
      ) // LINE 39
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.89 },
          { text: `  ${(Number(taxableSaleWithoutTaxes) + Number(totalTaxes)).toFixed(2) || 0}`, align: "LEFT", width: 0.16 }
        ]
      ) // LINE 42
      .feed(4) // LINE 43 - 45
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.89 },
          { text: `  ${''}`, align: "LEFT", width: 0.16 } // noTaxableSale
        ]
      ) // LINE 46
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.89 },
          { text: `  ${totalSale || 0}`, align: "LEFT", width: 0.16 }
        ]
      ) // LINE 47
      .marginLeft(0)
      .marginRight(0)
      .control('FF')
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCFTicket = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "GB18030", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      documentDatetime,
      customerAddress,
      customerDui,
      customerNit,
      customerPhone,
      paymentTypeName,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function(error){
      printer
      .font('A')
      .align('CT')
      .style('NORMAL')
      .size(0, 0)
      .text('LLANTERIA CORINTO')
      .text('Corinto, Morazan')
      .text(`Tel: ${'26666666'}`)
      .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
      .feed(1)
      .align('LT')
      .tableCustom([
        { text: `TICKET-${"0001"}`, align: "LEFT", width: 0.50 },
        { text: `COND: ${"CONTADO"}`, align: "RIGHT", width: 0.50 }
      ])
      .tableCustom([
        { text: `CAJA: ${'000'}`, align: "LEFT", width: 0.50 },
        { text: `SUC: ${"0000"}`, align: "RIGHT", width: 0.50 }
      ])
      .text(`Fecha: ${documentDatetime}`)
      .text(`Cliente: ${customerFullname}`)
      .text(`DUI o NIT: ${customerDui || customerNit || '-'}`)
      .feed(1) // LINE 9
      .align('CT')
      .text('------------------------------------------')
      .tableCustom([
        { text: `DESCRIPCION`, align: "LEFT", width: 1 }
      ])
      .tableCustom([
        { text: `CANT.`, align: "LEFT", width: 0.25 },
        { text: `PRES.`, align: "LEFT", width: 0.25 },
        { text: `PRE. UNI.`, align: "RIGHT", width: 0.25 },
        { text: `SUBTOTAL`, align: "RIGHT", width: 0.25 }
      ])
      .text('------------------------------------------')
      for (let i = 0; i < invoiceBodyData.length; i++) {
        printer.tableCustom([
          { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        ])
        .tableCustom([
          { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.25 },
          { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          { text: `${invoiceBodyData[i].unitPrice || 0}`, align: "RIGHT", width: 0.25 },
          { text: `${invoiceBodyData[i].subTotal || 0}`, align: "RIGHT", width: 0.25 }
        ]);

        if((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.text('------------------------------------------')
      .tableCustom([
        { text: `SUMAS`, align: "LEFT", width: 0.25 },
        { text: ``, align: "LEFT", width: 0.25 },
        { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${totalSale || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `TOTAL`, align: "LEFT", width: 0.25 },
        { text: ``, align: "LEFT", width: 0.25 },
        { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${totalSale || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .align('CT')
      .feed(1)
      .text('*** SIN EFECTO FISCAL ***')
      .feed(2)
      .control('FF')
      .cut()
      .feed(2)
      // .cashdraw(2)
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printInternalSaleTicket = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "GB18030", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      locationName,
      documentTypeName,
      docNumber,
      documentDatetime,
      customerAddress,
      customerDui,
      customerNit,
      customerPhone,
      paymentTypeName,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function(error){
      printer
      .font('A')
      .align('CT')
      .style('NORMAL')
      .size(0, 0)
      .text('TIENDA CANDY')
      .text('CALLE PRINCIPAL, EL CUCO, FRENTE A LA PNC, DISTRITO DE CHIRILAGUA, MINICIPIO DE SAN MIGUEL CENTRO, DEPARTAMENTO DE SAN MIGUEL')
      .text(`Tel: ${'7263-6713'}`)
      .text('*** TICKET DE CONTROL INTERNO ***')
      // .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
      .feed(1)
      .align('LT')
      .tableCustom([
        { text: `DOC: ${documentTypeName} ${docNumber}`, align: "LEFT", width: 0.65 },
        { text: `COND: ${String(paymentTypeName).toUpperCase()}`, align: "RIGHT", width: 0.35 }
      ])
      .tableCustom([
        { text: ``, align: "LEFT", width: 0.50 },
        { text: `SUC: ${String(locationName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
      ])
      .text(`Fecha: ${documentDatetime}`)
      .text(`Cliente: ${customerFullname}`)
      .text(`DUI o NIT: ${customerDui || customerNit || '-'}`)
      .feed(1) // LINE 9
      .align('CT')
      // .text('------------------------------------------------')
      // .tableCustom([
      //   { text: `DESCRIPCION`, align: "LEFT", width: 1 }
      // ])
      // .style('U')
      .tableCustom([
        // { text: `CANT.`, align: "LEFT", width: 0.15 },
        { text: `DESCRIPCION`, align: "LEFT", width: 0.55 },
        // { text: `PRES.`, align: "LEFT", width: 0.25 },
        { text: ``, align: "RIGHT", width: 0.25 },
        { text: `SUBTOTAL`, align: "RIGHT", width: 0.20 }
      ])
      .text('------------------------------------------------')
      // .feed(1)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 0.55 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0} x ${invoiceBodyData[i].unitPrice || 0}`, align: "RIGHT", width: 0.25 },
          { text: `${invoiceBodyData[i].subTotal || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        if((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.style('NORMAL')
      // .feed(1)
      .text('------------------------------------------------')
      // .text('------------------------------------------')
      .tableCustom([
        { text: `SUMAS`, align: "LEFT", width: 0.30 },
        { text: ``, align: "LEFT", width: 0.25 },
        { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${totalSale || 0}`, align: "RIGHT", width: 0.20 }
      ])
      .tableCustom([
        { text: `TOTAL`, align: "LEFT", width: 0.30 },
        { text: ``, align: "LEFT", width: 0.25 },
        { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${totalSale || 0}`, align: "RIGHT", width: 0.20 }
      ])
      .align('CT')
      .feed(1)
      .text('*** SIN EFECTO FISCAL ***')
      .feed(2)
      .control('FF')
      .cut()
      // .feed(2)
      // .cashdraw(2)
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printDteVoucher = (req, res) => {
  try {
    const { useNetworkPrint } = req.query;
    
    let device;

    if (+useNetworkPrint === 1) {
      device = new escpos.Network('192.168.1.100', 9105);
    } else {
      device = new escpos.USB(vId, pId);
    }
    // const device  = new escpos.USB(vId, pId);
    // const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "GB18030", width: 48 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      cashierId,
    controlNumber,
    cotransTaxAmount,
    createdBy,
    createdByFullname,
    currencyType,
    customerAddress,
    customerBusinessLine,
    customerCityMhCode,
    customerCityName,
    customerCode,
    customerDefPhoneNumber,
    customerDepartmentMhCode,
    customerDepartmentName,
    customerDui,
    customerEconomicActivityCode,
    customerEconomicActivityName,
    customerEmail,
    customerFullname,
    customerId,
    customerNit,
    customerNrc,
    customerOccupation,
    docDate,
    docDatetime,
    docDatetimeFormatted,
    docDatetimeLabel,
    docNumber,
    docTime,
    documentTypeId,
    documentTypeName,
    dteTransmitionStatus,
    dteTransmitionStatusName,
    dteType,
    establishmentType,
    estCodeInternal,
    estCodeMH,
    expirationDays,
    expirationInformation,
    expired,
    expiresIn,
    fovialTaxAmount,
    generationCode,
    id: currentSaleId,
    isNoTaxableOperation,
    isVoided,
    IVAperception,
    IVAretention,
    ivaTaxAmount,
    locationAddress,
    locationCityMhCode,
    locationCityName,
    locationDepartmentMhCode,
    locationDepartmentName,
    locationEmail,
    locationId,
    locationName,
    locationPhone,
    noTaxableSubTotal,
    ownerActivityCode,
    ownerActivityDescription,
    ownerName,
    ownerNit,
    ownerNrc,
    ownerTradename,
    paymentStatus,
    paymentStatusName,
    paymentTypeId,
    paymentTypeName,
    posCodeInternal,
    posCodeMH,
    receptionStamp,
    saleTotalPaid,
    serie,
    shiftcutId,
    taxableSubTotal,
    taxableSubTotalWithoutTaxes,
    total,
    totalInLetters,
    totalTaxes,
    transmissionModel,
    transmissionModelName,
    transmissionType,
    transmissionTypeName,
    userPINCodeFullName,
    voidedByFullname,
    notes
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalInLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function(error){
      printer
      .font('A')
      .align('CT')
      .style('NORMAL')
      .size(0, 0)
      .text(ownerTradename || '')
      .text(locationAddress || '')
      .text(locationPhone || '')
      // .text('*** TICKET DE CONTROL INTERNO ***')
      // .text(`NIT: ${'0000-000000-000-0'} - NRC: ${'00000-0'}`)
      .feed(1)
      .align('LT')
      .tableCustom([
        { text: `COD INTERNO: ${currentSaleId}`, align: "LEFT", width: 0.50 },
        { text: `COND: ${String(paymentTypeName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
      ])
      .tableCustom([
        { text: `DOC: ${documentTypeName}`, align: "LEFT", width: 0.50 },
        { text: `SUC: ${String(locationName).toUpperCase()}`, align: "RIGHT", width: 0.50 }
      ])
      .text(`FECHA: ${dayjs(docDatetime).format('YYYY-MM-DD hh:mm:ss')}`)
      .text(`CLIENTE: ${customerFullname}`)
      .text(`DUI: ${customerDui || '-'}`)
      .text(`NIT: ${customerNit || '-'}`)
      .text(`NRC: ${customerNrc || '-'}`)
      // .qrimage('https://github.com/song940/node-escpos', function(err){

      // })
      .feed(1) // LINE 9
      .align('CT')
      // .text('------------------------------------------------')
      // .tableCustom([
      //   { text: `DESCRIPCION`, align: "LEFT", width: 1 }
      // ])
      // .style('U')
      .tableCustom([
        // { text: `CANT.`, align: "LEFT", width: 0.15 },
        { text: `DESCRIPCION`, align: "LEFT", width: 0.55 },
        // { text: `PRES.`, align: "LEFT", width: 0.25 },
        { text: ``, align: "RIGHT", width: 0.25 },
        { text: `SUBTOTAL`, align: "RIGHT", width: 0.20 }
      ])
      .text('------------------------------------------------')
      // .feed(1)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        const {
          saleDetailId,
          saleId,
          productId,
          productTypeId,
          productCode,
          productName,
          productMeasurementUnitId,
          categoryName,
          brandName,
          measurementUnitName,
          unitPrice,
          unitPriceNoTaxes,
          unitPriceIva,
          unitPriceFovial,
          unitPriceCotrans,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          ivaTaxAmount,
          fovialTaxAmount,
          cotransTaxAmount,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = invoiceBodyData[i];
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.99 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          // { text: `${Number(quantity).toFixed(4) || 0} x ${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "RIGHT", width: 0.25 },
          // { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
          { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        ]);

        if((i + 1) < invoiceBodyData.length) printer.feed(1);
      } // LINE 15
      printer.style('NORMAL')
      // .feed(1)
      .text('------------------------------------------------')
      // .text('------------------------------------------')
      .tableCustom([
        { text: `GRAVADO`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${(isNoTaxableOperation ? 0 : taxableSubTotal - ((+fovialTaxAmount + +cotransTaxAmount + ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount)) || 0)).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `EXENTO`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${(isNoTaxableOperation ? taxableSubTotalWithoutTaxes : 0).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `SUMA TOTAL DE OPERACIONES`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${(isNoTaxableOperation ? taxableSubTotalWithoutTaxes : taxableSubTotal - ((+fovialTaxAmount + +cotransTaxAmount + ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount)))).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ]);
      if (!(documentTypeId === 1 || documentTypeId === 2)) {
        printer.tableCustom([
          { text: `IVA`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(isNoTaxableOperation ? 0 : ivaTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      printer.tableCustom([
        { text: `SUBTOTAL`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${(isNoTaxableOperation ? taxableSubTotalWithoutTaxes : taxableSubTotal - ((+fovialTaxAmount + +cotransTaxAmount))).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `IVA PERCIBIDO (1%)`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(IVAperception).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `IVA RETENIDO (1%)`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(IVAretention).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ]);
      if (+fovialTaxAmount !== null && +fovialTaxAmount > 0) {
        printer.tableCustom([
          { text: `FOVIAL ($0.20/gal)`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(fovialTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      if (+cotransTaxAmount !== null && +cotransTaxAmount > 0) {
        printer.tableCustom([
          { text: `COTRANS ($0.10/gal)`, align: "RIGHT", width: 0.75 },
          // { text: ``, align: "LEFT", width: 0.25 },
          // { text: ``, align: "RIGHT", width: 0.25 },
          { text: `${Number(cotransTaxAmount).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
        ]);
      }
      printer.tableCustom([
        { text: `RETE. RENTA`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(0).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `MONTO TOTAL OPERACION`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(+total - (isNoTaxableOperation ? +ivaTaxAmount : 0) - +IVAretention + +IVAperception).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `OTROS MONTOS NO AFECTOS`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(0).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      .tableCustom([
        { text: `TOTAL A PAGAR`, align: "RIGHT", width: 0.75 },
        // { text: ``, align: "LEFT", width: 0.25 },
        // { text: ``, align: "RIGHT", width: 0.25 },
        { text: `${Number(+total - (isNoTaxableOperation ? +ivaTaxAmount : 0) - +IVAretention + +IVAperception).toFixed(2) || 0}`, align: "RIGHT", width: 0.25 }
      ])
      // .tableCustom([
      //   { text: `TOTAL`, align: "LEFT", width: 0.30 },
      //   { text: ``, align: "LEFT", width: 0.25 },
      //   { text: ``, align: "RIGHT", width: 0.25 },
      //   { text: `${total || 0}`, align: "RIGHT", width: 0.20 }
      // ])
      .align('CT')
      .feed(1)
      .text(`CODIGO DE GENERACION:`)
      .text(`${generationCode}`)
      .text(`NUMERO DE CONTROL:`)
      .text(`${controlNumber}`)
      .text(`SELLO RECEPCION`)
      .text(`${receptionStamp}`)
      .feed(1)
      .tableCustom([
        { text: `ESTADO:`, align: "LEFT", width: 0.50 },
        { text: `${dteTransmitionStatusName}`, align: "RIGHT", width: 0.50 }
      ])
      .tableCustom([
        { text: `TIPO:`, align: "LEFT", width: 0.50 },
        { text: `${transmissionTypeName}`, align: "RIGHT", width: 0.50 }
      ])
      .tableCustom([
        { text: `MODELO TRANSMISION:`, align: "LEFT", width: 0.50 },
        { text: `${transmissionModelName}`, align: "RIGHT", width: 0.50 }
      ])
      .align('CT')
      // .text('')
      // .feed(2)
      .control('FF')
      // .qrcode(
      //   `https://admin.factura.gob.sv/consultaPublica?ambiente=01&codGen=${generationCode || ''}&fechaEmi=${dayjs(docDatetime).format('YYYY-MM-DD') || ''}`,
      //   undefined,
      //   "h",
      //   50
      // )
      // .text('*** ESTE COMPROBANTE NO TIENE EFECTO FISCAL ***')
      // .feed(2)
      // .cut()
      // .close((err) => {
      //   if (err) {
      //     res.json({ data: "Print error" });
      //   } else {
      //     res.json({ data: "Print success" });
      //   }
      // });
      .qrimage(
        `https://admin.factura.gob.sv/consultaPublica?ambiente=01&codGen=${generationCode || ''}&fechaEmi=${dayjs(docDatetime).format('YYYY-MM-DD') || ''}`,
        { type: 'png', mode: 'dhdw', size: 3 },
        function(err){
        this.text('*** ESTE COMPROBANTE NO TIENE EFECTO FISCAL ***');
        this.feed(2);
        this.cut();
        this.close((err) => {
          if (err) {
            res.json({ data: "Print error" });
          } else {
            res.json({ data: "Print success" });
          }
        });
      });
      // .cut()
      // .feed(2)
      // .cashdraw(2)
      // .close((err) => {
      //   if (err) {
      //     res.json({ data: "Print error" });
      //   } else {
      //     res.json({ data: "Print success" });
      //   }
      // });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCF = (req, res) => {
  try {
    const device = new escpos.USB(matrix_vId, matrix_pId);
    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    if (invoiceHeaderData === undefined || invoiceBodyData === undefined) {
      throw "You must provide a header and body sale data to print";
    }

    const {
      customerFullname,
      documentDatetime,
      customerAddress,
      customerDui,
      customerNit,
      customerPhone,
      paymentTypeName,
      totalSale,
      totalToLetters
    } = invoiceHeaderData;

    let totalToLettersSplited = (totalToLetters || " ( ").split("(", 2);
    let totalToLettersPartOne = totalToLettersSplited[0];
    let totalToLettersPartTwo = `(${totalToLettersSplited[1]}`;

    device.open(function(error){
      printer
      .font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .marginLeft(3)
      .marginRight(4)
      .feed(9) // LINE 1 - 8
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.75 },
          { text: `  ${documentDatetime || ''}`, align: "LEFT", width: 0.25 }
        ]
      ) // LINE 9 FECHA
      .feed(1) // LINE 9
      .text(`      ${customerFullname.substring(0, 49) || ''}`) // LINE 10 CLIENTE NAME
      .tableCustom(
        [
          { text: `         ${customerAddress.substring(0, 41) || ''}`, align: "LEFT", width: 1 }
        ]
      ) // LINE 11 ADDRESS
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.75 },
          { text: `  ${paymentTypeName || ''}`, align: "LEFT", width: 0.25 }
        ]
      ) // LINE 12
      .feed(3) // LINE 13 - 14
      .marginLeft(5)
      for (let i = 0; i < invoiceBodyData.length; i++) {
        printer.tableCustom(
          [
            { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.06 },
            { text: `${invoiceBodyData[i].productName || ""}`.substring(0, 29), align: "LEFT", width: 0.57 },
            // { text: "", align: "LEFT", width: 0.11 },
            { text: `${invoiceBodyData[i].unitPrice || 0}`, align: "LEFT", width: 0.11 },
            { text: "", align: "LEFT", width: 0.13 },
            { text: `${invoiceBodyData[i].subTotal || 0}`, align: "LEFT", width: 0.15 }
          ]
        );
      } // LINE 15
      printer
      .feed(14 - (+invoiceBodyData.length)) // LINE 18 - 36
      .feed(7)
      .tableCustom(
        [
          { text: `  ${totalToLettersPartOne || ''}`, align: "LEFT", width: 0.50 },
          { text: "", align: "LEFT", width: 0.34 },
          { text: `${totalSale || 0}`, align: "LEFT", width: 0.15 }
        ]
      ) // LINE 38
      .tableCustom(
        [
          { text: `  ${totalToLettersPartTwo || ''}`, align: "LEFT", width: 0.50 },
          { text: "", align: "LEFT", width: 0.34 },
          { text: ``, align: "LEFT", width: 0.15 }
        ]
      ) // LINE 39
      .feed(4) // LINE 40 - 45
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.88 },
          { text: "", align: "LEFT", width: 0.15 }
        ]
      ) // LINE 46 // noTaxableTotalSale
      .tableCustom(
        [
          { text: "", align: "LEFT", width: 0.88 },
          { text: `${totalSale || 0}`, align: "LEFT", width: 0.15 }
        ]
      ) // LINE 47 // TOTAL SALE
      .marginLeft(0)
      .marginRight(0)
      .control('FF')
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printGuideLines = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    device.open(function(error){
      printer
      .font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .marginLeft(0)
      .marginRight(0)
      .text('1 - Margin 0 - 0') // LINE 1
      .text('2') // LINE 2
      .text('3') // LINE 3
      .text('4') // LINE 4
      .text('5') // LINE 5
      .marginLeft(1)
      .marginRight(1)
      .text('6 - Margin 1 - 1') // LINE 6
      .text('7') // LINE 7
      .text('8') // LINE 8
      .text('9') // LINE 9
      .text('10') // LINE 10
      .marginLeft(2)
      .marginRight(2)
      .text('11 - Margin 2 - 2') // LINE 11
      .text('12') // LINE 12
      .text('13') // LINE 13
      .text('14') // LINE 14
      .text('15') // LINE 15
      .marginLeft(3)
      .marginRight(3)
      .text('16 - Margin 3 - 3') // LINE 16
      .text('17') // LINE 17
      .text('18') // LINE 18
      .text('19') // LINE 19
      .text('20') // LINE 20
      .marginLeft(0)
      .marginRight(0)
      .text('21') // LINE 21
      .text('22') // LINE 22
      .text('23') // LINE 23
      .text('24') // LINE 24
      .text('25') // LINE 25
      .text('26') // LINE 26
      .text('27') // LINE 27
      .text('28') // LINE 28
      .text('29') // LINE 29
      .text('30') // LINE 30
      .text('31') // LINE 31
      .text('32') // LINE 32
      .text('33') // LINE 33
      .text('34') // LINE 34
      .text('35') // LINE 35
      .text('36') // LINE 36
      .text('37') // LINE 37
      .text('38') // LINE 38
      .text('39') // LINE 39
      .text('40') // LINE 40
      .text('41') // LINE 41
      .text('42') // LINE 42
      .text('43') // LINE 43
      .text('44') // LINE 44
      .text('45') // LINE 45
      .text('46') // LINE 46
      .text('47') // LINE 47
      .text('48') // LINE 48
      .control('FF')
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printCharLine = (req, res) => {
  try {
    // const device  = new escpos.USB(vId, pId);
    const device = new escpos.Network('127.0.0.1', 9105);
    const options = { encoding: "GB18030", width: 56 /* default */ }
    const printer = new escpos.Printer(device, options);

    // invoiceHeaderData = { customerFullname, documentDatetime, customerAddress, customerDui, customerNit, customerPhone, totalSale, totalToLetters }
    // invoiceBodyData = [{ quantity, description, unitPrice, subTotal }]

    device.open(function(error){
      printer
      .font('A')
      .align('LT')
      .style('NORMAL')
      .size(0, 0)
      .marginLeft(0)
      .marginRight(0)
      .text('1234567890123456789012345678901234567890123456789012345678901234567890') // LINE 1
      .control('FF')
      .close((err) => {
        if (err) {
          res.json({ data: "Print error" });
        } else {
          res.json({ data: "Print success" });
        }
      });
    });
  } catch(err) {
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printSaleDetailsToNetworkPrinter = (req, res) => {
  try {
    const { printerIp, printerPort, detailsData, headData } = req.body;

    const {
      id,
      controlNumber,
      generationCode,
      dteType,
      receptionStamp,
      dteTransmitionStatus,
      dteTransmitionStatusName,
      transmissionType,
      transmissionTypeName,
      transmissionModel,
      transmissionModelName,
      currencyType,
      shiftcutId,
      isNoTaxableOperation,
      customerComplementaryName,
      cashierId,
      estCodeInternal,
      estCodeMH,
      posCodeInternal,
      posCodeMH,
      locationId,
      locationName,
      locationPhone,
      locationAddress,
      locationDepartmentName,
      locationCityName,
      locationDepartmentMhCode,
      locationCityMhCode,
      locationEmail,
      ownerNit,
      ownerNrc,
      ownerName,
      ownerActivityCode,
      ownerActivityDescription,
      ownerTradename,
      establishmentType,
      customerId,
      documentTypeId,
      documentTypeName,
      paymentTypeId,
      paymentTypeName,
      createdBy,
      createdByFullname,
      userPINCodeFullName,
      docDatetime,
      docDatetimeFormatted,
      docDate,
      docTime,
      docDatetimeLabel,
      docNumber,
      serie,
      paymentStatus,
      expirationDays,
      expirationInformation,
      expiresIn,
      expired,
      IVAretention,
      IVAperception,
      paymentStatusName,
      isVoided,
      voidedByFullname,
      total,
      ivaTaxAmount,
      fovialTaxAmount,
      cotransTaxAmount,
      totalTaxes,
      taxableSubTotal,
      taxableSubTotalWithoutTaxes,
      noTaxableSubTotal,
      totalInLetters,
      notes,
      saleTotalPaid,
      customerCode,
      customerFullname,
      customerAddress,
      customerDefPhoneNumber,
      customerEmail,
      customerDui,
      customerNit,
      customerNrc,
      customerBusinessLine,
      customerOccupation,
      customerDepartmentName,
      customerCityName,
      customerDepartmentMhCode,
      customerCityMhCode,
      customerEconomicActivityCode,
      customerEconomicActivityName
    } = headData;

    const networkDevice = new escpos.Network(printerIp, printerPort);

    const options = { encoding: "860", width: 48 /* default */ }
    const printer = new escpos.Printer(networkDevice, options);

    const remoteAddress = req.headers['x-real-ip'] || req.connection.remoteAddress;

    networkDevice.open(function(error){
      if (error) {
        console.error('Error al abrir la conexión con la impresora:', error);
        return res.status(500).json({ status: 500, message: 'Error al conectar con la impresora', errorContent: error });
      }

      printer
      .font('A')
      .align('CT')
      .style('NORMAL')
      .size(0, 0)
      .feed(5)
      .text(`COCINA`)
      .text('-----------------------------------------')
      .align('LT')
      .text(`ORDEN N° ${id}`)
      .text(`Fecha: ${docDatetime}`)
      .text(`Cliente: ${customerFullname}`)
      .align('CT')
      .text('-----------------------------------------')
      .align('LT');
      for (let i = 0; i < detailsData.length; i++) {
        const {
          saleDetailId,
          saleId,
          productId,
          productTypeId,
          productCode,
          productName,
          productMeasurementUnitId,
          categoryName,
          brandName,
          measurementUnitName,
          unitPrice,
          unitPriceNoTaxes,
          unitPriceIva,
          unitPriceFovial,
          unitPriceCotrans,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          ivaTaxAmount,
          fovialTaxAmount,
          cotransTaxAmount,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = detailsData[i];

        let isNoTaxableOperation = false;
        let documentTypeId = 2;
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${Number(quantity).toFixed(4) || ""}`, align: "LEFT", width: 0.20 },
          { text: `${""}`, align: "LEFT", width: 0.04 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.75 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          // { text: `${Number(quantity).toFixed(4) || 0} x ${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "RIGHT", width: 0.25 },
          // { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        // printer.style('U').tableCustom([
        //   // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
        //   // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
        //   { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
        //   { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        // ]);

        if((i + 1) < detailsData.length) printer.feed(1);
      }
      printer.feed(4)
      .cut()
      .align('CT')
      .style('NORMAL')
      .size(0, 0)
      .feed(5)
      .text(`CLIENTE`)
      .text('-----------------------------------------')
      .align('LT')
      .text(`ORDEN N° ${id}`)
      .text(`Fecha: ${docDatetime}`)
      .text(`Cliente: ${customerFullname}`)
      .align('CT')
      .text('-----------------------------------------')
      .align('LT');
      for (let i = 0; i < detailsData.length; i++) {
        const {
          saleDetailId,
          saleId,
          productId,
          productTypeId,
          productCode,
          productName,
          productMeasurementUnitId,
          categoryName,
          brandName,
          measurementUnitName,
          unitPrice,
          unitPriceNoTaxes,
          unitPriceIva,
          unitPriceFovial,
          unitPriceCotrans,
          unitCost,
          unitCostNoTaxes,
          subTotalCost,
          totalCostTaxes,
          totalCost,
          quantity,
          subTotal,
          isVoided,
          isActive,
          taxesData,
          ivaTaxAmount,
          fovialTaxAmount,
          cotransTaxAmount,
          totalTaxes,
          taxableSubTotal,
          taxableSubTotalWithoutTaxes,
          noTaxableSubTotal
        } = detailsData[i];

        let isNoTaxableOperation = false;
        let documentTypeId = 2;
        // printer.tableCustom([
        //   { text: `${invoiceBodyData[i].productName || ""}`, align: "LEFT", width: 1 }
        // ])
        printer.style('U').tableCustom([
          // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
          { text: `${Number(quantity).toFixed(4) || ""}`, align: "LEFT", width: 0.20 },
          { text: `${""}`, align: "LEFT", width: 0.04 },
          { text: `${productName || ""}`, align: "LEFT", width: 0.75 },
          // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
          // { text: `${Number(quantity).toFixed(4) || 0} x ${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "RIGHT", width: 0.25 },
          // { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.20 }
        ]);

        // printer.style('U').tableCustom([
        //   // { text: `${Number(invoiceBodyData[i].quantity).toFixed(0) || 0}`, align: "LEFT", width: 0.15 },
        //   // { text: `${"UNID"} x`, align: "LEFT", width: 0.25 },
        //   { text: `${Number(quantity).toFixed(4) || 0} x $${(+unitPrice - (+unitPriceFovial + +unitPriceCotrans + (isNoTaxableOperation ? +unitPriceIva : 0))).toFixed(4) || 0}`, align: "LEFT", width: 0.50 },
        //   { text: `${(isNoTaxableOperation === 1 ? (+noTaxableSubTotal - +ivaTaxAmount - +fovialTaxAmount - +cotransTaxAmount) : (+taxableSubTotal - ((documentTypeId === 1 || documentTypeId === 2) ? 0 : +ivaTaxAmount) - +fovialTaxAmount - +cotransTaxAmount)).toFixed(4) || 0}`, align: "RIGHT", width: 0.50 }
        // ]);

        if((i + 1) < detailsData.length) printer.feed(1);
      }
      printer.feed(4)
      .cut()
      .close((err) => {
        if (err) {
          res.status(500).json({ status: 500, message: 'Printer connection failed!', errorContent: err });
        } else {
          res.json({ data: "Printer connection success!" });
        }
      });
    });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printLegalizedTicket = (req, res) => {
  try {
    const { invoiceHeaderData, invoiceBodyData } = req.body;

    let encoder = new ReceiptPrinterEncoder({
      language: 'esc-pos',
      columns: 42,
      feedBeforeCut: 0,
      newline: '\n'
    });

    // let commands = encoder.initialize()
    encoder.initialize()
    // .raw([0x1B, 0x3D, 0x01])
    .raw([0x1B, 0x63, 0x30, 0x03])
    .line('')
    .align('center')
    .line(`${invoiceHeaderData.ownerName}`)
    .line(`${invoiceHeaderData.ownerTradename}`)
    // .line(`${invoiceHeaderData.locationName}`)
    // .line('')
    .line(`${invoiceHeaderData.locationAddress}`)
    // .line('')
    .line(`${String(`NRC: ${invoiceHeaderData.ownerNrc}`.padEnd(16))} ${String(`NIT: ${invoiceHeaderData.ownerNit}`.padEnd(22))}`)
    .align('left')
    .line(`RES: ${invoiceHeaderData.ticketResolutionNumber}`)
    .line(`FECHA RES: ${invoiceHeaderData.ticketResolutionDate}`)
    .line(`SERIE AUT: Del ${invoiceHeaderData.ticketResolutionAuthorizedSerieFrom} Al ${invoiceHeaderData.ticketResolutionAuthorizedSerieTo}`)
    .align('center')
    .line(`${invoiceHeaderData.cashierName}`)
    .line(`TICKET N° ${String(invoiceHeaderData.docNumber).padStart(6, '0')}`)
    // .line('')
    .align('left')
    .line(`${String('Cant').padEnd(7)} ${String('Descripcion').padEnd(21)} ${String('Precio').padStart(9)}`)
    .line('----------------------------------------');

    for (let i = 0; i < invoiceBodyData.length; i++) {
      encoder.line(`${String(Number(invoiceBodyData[i].quantity).toFixed(2)).padEnd(7)} ${String(invoiceBodyData[i].productName).substring(0, 21).padEnd(21)} ${String(Number(invoiceBodyData[i].subTotal).toFixed(2)).padStart(9)}`);
    }

    // encoder.line(`${String('Cant').padEnd(9)} ${String('Descripcion').padEnd(19)} ${String('Precio').padStart(9)}`)
    // encoder.line(`${String('10.00').padEnd(9)} ${String('FRIJOLES LA CHULA').padEnd(19)} ${String('16.50').padStart(9)}`)
    encoder.line('----------------------------------------')
    .align('left')
    .line(`${String('TOTAL GRAVADO:').padEnd(20)}${String(Number(invoiceHeaderData.taxableSubTotal || 0).toFixed(2)).padStart(18)}`)
    .line(`${String('TOTAL EXENTO:').padEnd(20)}${String(Number(invoiceHeaderData.noTaxableSubTotal || 0).toFixed(2)).padStart(18)}`)
    .line(`${String('TOTAL NO SUJETO:').padEnd(20)}${String(Number(0).toFixed(2)).padStart(18)}`)
    .line(`${String('TOTAL VENTA:').padEnd(20)}${String(Number(invoiceHeaderData.total || 0).toFixed(2)).padStart(18)}`)
    .line('')
    .line(`VENDEDOR: ${invoiceHeaderData.sellerPINCodeFullName}`.padEnd(39))
    .line(`CAJERO: ${invoiceHeaderData.userPINCodeFullName}`.padEnd(39))
    .line(`${invoiceHeaderData.docDatetimeForTicket}`.padEnd(39))
    .line('')
    .align('center')
    .line('No se aceptan cambios ni devoluciones sin presentar este ticket')
    .line('')
    .line('*-*-* GRACIAS POR PREFERIRNOS *-*-*')
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .raw(escposcommands.alternativeCut)
    .line('')
    .line('')
    .line('');
    // .encode();

    let commands = encoder.encode();

    const pcName = 'Luciernaga';
    const printerName = 'Epson TM-U950 Receipt';

    const printerPath = `\\\\${pcName}\\${printerName}`;

    const tempFile = 'comandos_print.bin';
    // const tempFile = 'temp_comandos.txt';
    // const cutCommand = new Uint8Array([0x1B, 0x69]);
    fs.writeFileSync(tempFile, Buffer.from(commands), 'binary');
    // fs.writeFileSync(tempFile, `${commands}`, 'binary');

    const command = `copy /b ${tempFile} "${printerPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error al imprimir ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`Error ${stderr}`);
        return;
      }
      console.log('Impresor completa');
      return;
    });

    res.json({ data: "Printer connection success!" });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printSettlementXTicket = (req, res) => {
  try {
    const { settlementData } = req.body;

    const shiftcutData = settlementData[0];

    const {
      locationOwnerTradename,
      locationOwnerName,
      locationOwnerActivityCode,
      locationOwnerActivityDescription,
      locationOwnerNit,
      locationOwnerNrc,
      shiftcutDatetime,
      shiftcutDatetimeFormatted,
      openedByFullname,
      closedByFullname,
      cashierName,
      shiftcutNumber
    } = shiftcutData[0];

    const ticketsXData = settlementData[1];

    const {
      label: ticketLabel,
      numberOfTransactions: ticketNumberOfTransactions,
      initialDocNumber: ticketInitialDocNumber,
      finalDocNumber: ticketFinalDocNumber,
      taxableTotal: ticketTaxableTotal,
      noTaxableTotal: ticketNoTaxableTotal,
      noSubjectTotal: ticketNoSubjectTotal,
      total: ticketTotal
    } = ticketsXData[0];

    const cfXData = settlementData[2];

    const {
      label: cfLabel,
      numberOfTransactions: cfNumberOfTransactions,
      initialDocNumber: cfInitialDocNumber,
      finalDocNumber: cfFinalDocNumber,
      taxableTotal: cfTaxableTotal,
      noTaxableTotal: cfNoTaxableTotal,
      noSubjectTotal: cfNoSubjectTotal,
      total: cfTotal
    } = cfXData[0];

    const ccfXData = settlementData[3];

    const {
      label: ccfLabel,
      numberOfTransactions: ccfNumberOfTransactions,
      initialDocNumber: ccfInitialDocNumber,
      finalDocNumber: ccfFinalDocNumber,
      taxableTotal: ccfTaxableTotal,
      noTaxableTotal: ccfNoTaxableTotal,
      noSubjectTotal: ccfNoSubjectTotal,
      total: ccfTotal
    } = ccfXData[0];
    
    let encoder = new ReceiptPrinterEncoder({
      language: 'esc-pos',
      columns: 42,
      feedBeforeCut: 0,
      newline: '\n'
    });

    // let commands = encoder.initialize()
    encoder.initialize()
    // .raw([0x1B, 0x3D, 0x01])
    .raw([0x1B, 0x63, 0x30, 0x03])
    .line('')
    .align('center')
    .line(`${locationOwnerName}`)
    .line(`${locationOwnerTradename}`)
    .line(`${locationOwnerActivityDescription}`)
    .line('')
    .align('left')
    .line(`${String('NIT:').padEnd(12)}${String(locationOwnerNit).padStart(26)}`)
    .line(`${String('NRC:').padEnd(12)}${String(locationOwnerNrc).padStart(26)}`)
    .line(`${String('Caja:').padEnd(12)}${String(cashierName).padStart(26)}`)
    .line(`${String('Turno:').padEnd(12)}${String(shiftcutNumber).padStart(26)}`)
    .line(`${String('Fecha:').padEnd(12)}${String(shiftcutDatetimeFormatted).padStart(26)}`)
    .line(`${String('Apertura:').padEnd(12)}${String(openedByFullname).padStart(26)}`)
    .line(`${String('Cierra:').padEnd(12)}${String(closedByFullname).padStart(26)}`)
    .align('center')
    .line('TICKET X')
    .align('left')
    .line('----------------------------------------')
    .line(`${String(ticketLabel).padEnd(18)}${String('').padStart(20)}`)
    .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ticketTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ticketNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ticketNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Total:').padEnd(18)}${String(Number(ticketTotal || 0).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(cfLabel).padEnd(18)}${String('').padStart(20)}`)
    .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(cfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(cfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(cfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Total:').padEnd(18)}${String(Number(cfTotal || 0).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(ccfLabel).padEnd(18)}${String('').padStart(20)}`)
    .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ccfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ccfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ccfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Total:').padEnd(18)}${String(Number(ccfTotal || 0).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String('TOTAL VENTAS:').padEnd(18)}${String(Number((+ticketTotal || 0) + (+cfTotal || 0) + (+ccfTotal || 0)).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String('Transacciones:').padEnd(18)}${String(Number((ticketNumberOfTransactions || 0) + (cfNumberOfTransactions || 0) + (ccfNumberOfTransactions || 0)).toFixed(0)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(ticketLabel).padEnd(18)}${String(Number(ticketNumberOfTransactions).toFixed(0)).padStart(20)}`)
    .line(`${String('Inicial').padEnd(18)}${String(Number(ticketInitialDocNumber).toFixed(0)).padStart(20)}`)
    .line(`${String('Final').padEnd(18)}${String(Number(ticketFinalDocNumber).toFixed(0)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(cfLabel).padEnd(18)}${String(Number(cfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    .line(`${String('Inicial').padEnd(18)}${String(Number(cfInitialDocNumber).toFixed(0)).padStart(20)}`)
    .line(`${String('Final').padEnd(18)}${String(Number(cfFinalDocNumber).toFixed(0)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(ccfLabel).padEnd(18)}${String(Number(ccfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    .line(`${String('Inicial').padEnd(18)}${String(Number(ccfInitialDocNumber).toFixed(0)).padStart(20)}`)
    .line(`${String('Final').padEnd(18)}${String(Number(ccfFinalDocNumber).toFixed(0)).padStart(20)}`)
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .raw(escposcommands.alternativeCut)
    .line('')
    .line('')
    .line('');
    // .encode();

    let commands = encoder.encode();

    const pcName = 'Luciernaga';
    const printerName = 'Epson TM-U950 Receipt';

    const printerPath = `\\\\${pcName}\\${printerName}`;

    const tempFile = 'comandos_print.bin';
    // const tempFile = 'temp_comandos.txt';
    // const cutCommand = new Uint8Array([0x1B, 0x69]);
    fs.writeFileSync(tempFile, Buffer.from(commands), 'binary');
    // fs.writeFileSync(tempFile, `${commands}`, 'binary');

    const command = `copy /b ${tempFile} "${printerPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error al imprimir ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`Error ${stderr}`);
        return;
      }
      console.log('Impresor completa');
      return;
    });

    res.json({ data: "Printer connection success!" });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

controller.printSettlementZTicket = (req, res) => {
  try {
    const { settlementData } = req.body;

    const shiftcutData = settlementData[0];

    const {
      locationId,
      locationName,
      cashierId,
      cashierName,
      locationOwnerTradename,
      locationOwnerName,
      locationOwnerActivityCode,
      locationOwnerActivityDescription,
      locationOwnerNit,
      locationOwnerNrc,
      shiftcutDatetime,
      shiftcutDate,
      openedByFullname,
      closedByFullname,
      prevShiftcutNumber,
      lastShiftcutNumber,
      prevShiftcutId,
      lastShiftcutId
    } = shiftcutData[0];

    const ticketsZData = settlementData[1];

    const {
      label: ticketLabel,
      numberOfTransactions: ticketNumberOfTransactions,
      initialDocNumber: ticketInitialDocNumber,
      finalDocNumber: ticketFinalDocNumber,
      taxableTotal: ticketTaxableTotal,
      noTaxableTotal: ticketNoTaxableTotal,
      noSubjectTotal: ticketNoSubjectTotal,
      total: ticketTotal
    } = ticketsZData[0];

    const cfZData = settlementData[2];

    const {
      label: cfLabel,
      numberOfTransactions: cfNumberOfTransactions,
      initialDocNumber: cfInitialDocNumber,
      finalDocNumber: cfFinalDocNumber,
      taxableTotal: cfTaxableTotal,
      noTaxableTotal: cfNoTaxableTotal,
      noSubjectTotal: cfNoSubjectTotal,
      total: cfTotal
    } = cfZData[0];

    const ccfZData = settlementData[3];

    const {
      label: ccfLabel,
      numberOfTransactions: ccfNumberOfTransactions,
      initialDocNumber: ccfInitialDocNumber,
      finalDocNumber: ccfFinalDocNumber,
      taxableTotal: ccfTaxableTotal,
      noTaxableTotal: ccfNoTaxableTotal,
      noSubjectTotal: ccfNoSubjectTotal,
      total: ccfTotal
    } = ccfZData[0];
    
    let encoder = new ReceiptPrinterEncoder({
      language: 'esc-pos',
      columns: 42,
      feedBeforeCut: 0,
      newline: '\n'
    });

    // let commands = encoder.initialize()
    encoder.initialize()
    // .raw([0x1B, 0x3D, 0x01])
    .raw([0x1B, 0x63, 0x30, 0x03])
    .line('')
    .align('center')
    .line(`${locationOwnerName}`)
    .line(`${locationOwnerTradename}`)
    .line(`${locationOwnerActivityDescription}`)
    .line('')
    .align('left')
    .line(`${String('NIT:').padEnd(12)}${String(locationOwnerNit).padStart(26)}`)
    .line(`${String('NRC:').padEnd(12)}${String(locationOwnerNrc).padStart(26)}`)
    .line(`${String('Caja:').padEnd(12)}${String(cashierName).padStart(26)}`)
    .line(`${String('Turno inicial:').padEnd(12)}${String(prevShiftcutNumber).padStart(26)}`)
    .line(`${String('Turno final:').padEnd(12)}${String(lastShiftcutNumber).padStart(26)}`)
    .line(`${String('Fecha:').padEnd(12)}${String(shiftcutDatetime).padStart(26)}`)
    .align('center')
    .line('TICKET Z')
    .align('left')
    .line('----------------------------------------')
    .line(`${String(ticketLabel).padEnd(18)}${String('').padStart(20)}`)
    .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ticketTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ticketNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ticketNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Total:').padEnd(18)}${String(Number(ticketTotal || 0).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(cfLabel).padEnd(18)}${String('').padStart(20)}`)
    .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(cfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(cfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(cfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Total:').padEnd(18)}${String(Number(cfTotal || 0).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(ccfLabel).padEnd(18)}${String('').padStart(20)}`)
    .line(`${String('Venta Gravada:').padEnd(18)}${String(Number(ccfTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta Exenta:').padEnd(18)}${String(Number(ccfNoTaxableTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Venta No Sujeta:').padEnd(18)}${String(Number(ccfNoSubjectTotal || 0).toFixed(2)).padStart(20)}`)
    .line(`${String('Total:').padEnd(18)}${String(Number(ccfTotal || 0).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String('TOTAL VENTAS:').padEnd(18)}${String(Number((+ticketTotal || 0) + (+cfTotal || 0) + (+ccfTotal || 0)).toFixed(2)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String('Transacciones:').padEnd(18)}${String(Number((ticketNumberOfTransactions || 0) + (cfNumberOfTransactions || 0) + (ccfNumberOfTransactions || 0)).toFixed(0)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(ticketLabel).padEnd(18)}${String(Number(ticketNumberOfTransactions).toFixed(0)).padStart(20)}`)
    .line(`${String('Inicial').padEnd(18)}${String(Number(ticketInitialDocNumber).toFixed(0)).padStart(20)}`)
    .line(`${String('Final').padEnd(18)}${String(Number(ticketFinalDocNumber).toFixed(0)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(cfLabel).padEnd(18)}${String(Number(cfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    .line(`${String('Inicial').padEnd(18)}${String(Number(cfInitialDocNumber).toFixed(0)).padStart(20)}`)
    .line(`${String('Final').padEnd(18)}${String(Number(cfFinalDocNumber).toFixed(0)).padStart(20)}`)
    .line('----------------------------------------')
    .line(`${String(ccfLabel).padEnd(18)}${String(Number(ccfNumberOfTransactions).toFixed(0)).padStart(20)}`)
    .line(`${String('Inicial').padEnd(18)}${String(Number(ccfInitialDocNumber).toFixed(0)).padStart(20)}`)
    .line(`${String('Final').padEnd(18)}${String(Number(ccfFinalDocNumber).toFixed(0)).padStart(20)}`)
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .line('')
    .raw(escposcommands.alternativeCut)
    .line('')
    .line('')
    .line('');
    // .encode();

    let commands = encoder.encode();

    const pcName = 'Luciernaga';
    const printerName = 'Epson TM-U950 Receipt';

    const printerPath = `\\\\${pcName}\\${printerName}`;

    const tempFile = 'comandos_print.bin';
    // const tempFile = 'temp_comandos.txt';
    // const cutCommand = new Uint8Array([0x1B, 0x69]);
    fs.writeFileSync(tempFile, Buffer.from(commands), 'binary');
    // fs.writeFileSync(tempFile, `${commands}`, 'binary');

    const command = `copy /b ${tempFile} "${printerPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error al imprimir ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`Error ${stderr}`);
        return;
      }
      console.log('Impresor completa');
      return;
    });

    res.json({ data: "Printer connection success!" });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}


module.exports = { controller };
