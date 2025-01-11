import epsonEPOS from '../assets/epos-2.27.0.js';

const controller = {};

controller.printTestPage = (req, res) => {
  try {
    const printer = new epsonEPOS.
    res.json({ data: "Printer connection success!" });
  } catch(err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'Printer not found!', errorContent: err });
  }
}

export default controller;