const blockchainService = require('../services/blockchainService');

exports.getNetwork = async (req, res) => {
  try {
    const network = await blockchainService.getNetwork();

    res.status(200).json({
      success: true,
      data: network,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Unable to connect to blockchain network',
    });
  }
};

exports.getBalance = async (req, res) => {
  try {
    const balance = await blockchainService.getBalance(req.params.address);

    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Unable to retrieve balance',
    });
  }
};

exports.readContract = async (req, res) => {
  try {
    const result = await blockchainService.readContract(req.body);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Contract interaction failed',
    });
  }
};
