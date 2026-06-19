exports.main = async (event, context) => {
  console.log('Test log: event =', JSON.stringify(event));
  return {
    msg: 'ok',
    input: event
  };
}; 