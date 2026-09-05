// Simple error handler middleware
function errorHandler(err, req, res, next) {
  console.error(err.message)

  const status = err.status || 500
  const message = err.message || 'Something went wrong'

  res.status(status).json({
    success: false,
    message,
  })
}

module.exports = errorHandler
