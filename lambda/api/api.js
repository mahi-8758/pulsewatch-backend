const http = require('http')
const https = require('https')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb')
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider')
const { randomUUID } = require('crypto')
const uuidv4 = () => randomUUID()

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const sesClient = new SESClient({})
const cognitoClient = new CognitoIdentityProviderClient({})

const TARGETS_TABLE = process.env.TARGETS_TABLE || 'MonitorTargets'
const RESULTS_TABLE = process.env.RESULTS_TABLE || 'CheckResults'
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'Incidents'
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.ALERT_EMAIL
const USER_POOL_ID = process.env.USER_POOL_ID
const REQUEST_TIMEOUT_MS = 8000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json',
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  }
}

function getOwnerId(event) {
  return event?.requestContext?.authorizer?.claims?.sub
}

function getOwnerEmail(event) {
  const claims = event?.requestContext?.authorizer?.claims
  if (!claims) return null
  if (claims.email) return claims.email
  const username = claims['cognito:username'] || claims.username
  if (username && typeof username === 'string' && username.includes('@')) return username
  return null
}

function getMethod(event) {
  return event.httpMethod || event.requestContext?.http?.method
}

function getPath(event) {
  return event.resource || event.path || event.rawPath || ''
}

function parseBody(event) {
  if (!event.body) return null
  if (typeof event.body === 'object') return event.body

  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
  return JSON.parse(bodyText)
}

async function getOwnedTarget(targetId, ownerId) {
  const result = await dynamoClient.send(new GetCommand({
    TableName: TARGETS_TABLE,
    Key: { targetId },
  }))

  if (!result.Item || result.Item.ownerId !== ownerId) return null
  return result.Item
}

async function getTargetsForOwner(ownerId) {
  const targets = []
  let ExclusiveStartKey

  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: TARGETS_TABLE,
      FilterExpression: 'ownerId = :ownerId',
      ExpressionAttributeValues: { ':ownerId': ownerId },
      ExclusiveStartKey,
    }))
    targets.push(...(result.Items || []))
    ExclusiveStartKey = result.LastEvaluatedKey
  } while (ExclusiveStartKey)

  return targets
}

async function createTarget(event, ownerId) {
  const body = parseBody(event)
  if (!body || !body.url || !body.label) {
    return response(400, { message: 'url and label are required' })
  }

  let parsedUrl
  try {
    parsedUrl = new URL(body.url)
  } catch (error) {
    return response(400, { message: 'url must be a valid http:// or https:// URL' })
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return response(400, { message: 'url must use http:// or https://' })
  }

  const ownerEmail = getOwnerEmail(event)

  const target = {
    targetId: uuidv4(),
    ownerId,
    ...(ownerEmail ? { ownerEmail } : {}),
    url: body.url,
    label: body.label,
    createdAt: new Date().toISOString(),
    lastStatus: 'unknown',
  }

  await dynamoClient.send(new PutCommand({
    TableName: TARGETS_TABLE,
    Item: target,
  }))

  return response(201, { targetId: target.targetId })
}

async function getHistory(event, ownerId, targetId) {
  const target = await getOwnedTarget(targetId, ownerId)
  if (!target) return response(404, { message: 'Target not found' })

  const result = await dynamoClient.send(new QueryCommand({
    TableName: RESULTS_TABLE,
    KeyConditionExpression: 'targetId = :targetId',
    ExpressionAttributeValues: { ':targetId': targetId },
    ScanIndexForward: false,
    Limit: 50,
  }))

  return response(200, result.Items || [])
}

async function getIncidents(event, ownerId, targetId) {
  const target = await getOwnedTarget(targetId, ownerId)
  if (!target) return response(404, { message: 'Target not found' })

  const result = await dynamoClient.send(new QueryCommand({
    TableName: INCIDENTS_TABLE,
    KeyConditionExpression: 'targetId = :targetId',
    ExpressionAttributeValues: { ':targetId': targetId },
    ScanIndexForward: false,
  }))

  return response(200, result.Items || [])
}

async function deleteAssociatedData(targetId) {
  let resultsExclusiveStartKey
  do {
    const resultsQuery = await dynamoClient.send(new QueryCommand({
      TableName: RESULTS_TABLE,
      KeyConditionExpression: 'targetId = :targetId',
      ExpressionAttributeValues: { ':targetId': targetId },
      ProjectionExpression: 'targetId, checkedAt',
      ExclusiveStartKey: resultsExclusiveStartKey,
    }))

    if (resultsQuery.Items && resultsQuery.Items.length > 0) {
      for (const item of resultsQuery.Items) {
        await dynamoClient.send(new DeleteCommand({
          TableName: RESULTS_TABLE,
          Key: { targetId: item.targetId, checkedAt: item.checkedAt },
        }))
      }
    }
    resultsExclusiveStartKey = resultsQuery.LastEvaluatedKey
  } while (resultsExclusiveStartKey)

  let incidentsExclusiveStartKey
  do {
    const incidentsQuery = await dynamoClient.send(new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: 'targetId = :targetId',
      ExpressionAttributeValues: { ':targetId': targetId },
      ProjectionExpression: 'targetId, startedAt',
      ExclusiveStartKey: incidentsExclusiveStartKey,
    }))

    if (incidentsQuery.Items && incidentsQuery.Items.length > 0) {
      for (const item of incidentsQuery.Items) {
        await dynamoClient.send(new DeleteCommand({
          TableName: INCIDENTS_TABLE,
          Key: { targetId: item.targetId, startedAt: item.startedAt },
        }))
      }
    }
    incidentsExclusiveStartKey = incidentsQuery.LastEvaluatedKey
  } while (incidentsExclusiveStartKey)
}

async function deleteTarget(event, ownerId, targetId) {
  if (!targetId) return response(400, { message: 'targetId is required' })

  const result = await dynamoClient.send(new GetCommand({
    TableName: TARGETS_TABLE,
    Key: { targetId },
  }))

  const target = result?.Item
  if (!target) return response(404, { message: 'Target not found' })

  if (target.ownerId !== ownerId) {
    return response(403, { message: 'Forbidden: You do not own this monitor' })
  }

  await dynamoClient.send(new DeleteCommand({
    TableName: TARGETS_TABLE,
    Key: { targetId },
  }))

  await deleteAssociatedData(targetId)

  return response(200, { message: 'Target deleted successfully' })
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let parsedUrl

    try {
      parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('URL must use http:// or https://')
      }
    } catch (error) {
      resolve({
        statusCode: 0,
        responseTimeMs: Date.now() - startedAt,
        isUp: false,
        error: error.message,
      })
      return
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http
    const request = transport.get(parsedUrl, { headers: { 'User-Agent': 'PulseWatch-Checker/1.0' } }, (response) => {
      const statusCode = response.statusCode || 0
      response.resume()
      response.on('end', () => {
        resolve({
          statusCode,
          responseTimeMs: Date.now() - startedAt,
          isUp: statusCode < 400,
        })
      })
    })

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    })

    request.on('error', (error) => {
      resolve({
        statusCode: 0,
        responseTimeMs: Date.now() - startedAt,
        isUp: false,
        error: error.message,
      })
    })
  })
}

async function resolveOwnerEmail(target) {
  if (target.ownerEmail) {
    return target.ownerEmail
  }

  if (target.ownerId && USER_POOL_ID) {
    try {
      const cognitoUser = await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: target.ownerId,
      }))
      const emailAttr = cognitoUser.UserAttributes?.find((attr) => attr.Name === 'email')?.Value
      if (emailAttr) {
        await dynamoClient.send(new UpdateCommand({
          TableName: TARGETS_TABLE,
          Key: { targetId: target.targetId },
          UpdateExpression: 'SET ownerEmail = :ownerEmail',
          ExpressionAttributeValues: { ':ownerEmail': emailAttr },
        })).catch((err) => console.error(`Failed to backfill ownerEmail for ${target.targetId}:`, err))

        return emailAttr
      }
    } catch (err) {
      console.error(`Failed to lookup owner email for ownerId ${target.ownerId} in Cognito:`, err.message)
    }
  }

  if (target.ownerId && typeof target.ownerId === 'string' && target.ownerId.includes('@')) {
    return target.ownerId
  }

  return null
}

async function publishTransition(target, status) {
  const recipientEmail = await resolveOwnerEmail(target)

  if (!recipientEmail) {
    console.error(`No recipient email resolved for target ${target.targetId} (ownerId: ${target.ownerId}); notification skipped.`)
    return
  }

  if (!SENDER_EMAIL) {
    console.error('SENDER_EMAIL is not configured; notification was not sent.')
    return
  }

  const direction = status === 'down' ? 'DOWN' : 'BACK UP'
  const subject = `PulseWatch Alert: ${target.label} is ${direction}`
  const bodyText = `Hello,\n\nYour monitor target "${target.label}" (${target.url}) is now ${direction}.\n\nChecked At: ${new Date().toISOString()}\n\n- PulseWatch Monitoring`

  try {
    await sesClient.send(new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: {
        ToAddresses: [recipientEmail],
      },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: bodyText } },
      },
    }))
    console.log(`Sent SES alert to ${recipientEmail} for target ${target.targetId} (${target.label} is ${direction})`)
  } catch (error) {
    console.error(`Failed to send SES alert to ${recipientEmail} for target ${target.targetId}:`, error)
  }
}

async function checkTarget(event, ownerId, targetId) {
  if (!targetId) return response(400, { message: 'targetId is required' })

  const result = await dynamoClient.send(new GetCommand({
    TableName: TARGETS_TABLE,
    Key: { targetId },
  }))

  const target = result?.Item
  if (!target) return response(404, { message: 'Target not found' })

  if (target.ownerId !== ownerId) {
    return response(403, { message: 'Forbidden: You do not own this monitor' })
  }

  const checkRes = await checkUrl(target.url)
  const status = checkRes.isUp ? 'up' : 'down'
  const checkedAt = new Date().toISOString()

  await dynamoClient.send(new PutCommand({
    TableName: RESULTS_TABLE,
    Item: {
      targetId,
      checkedAt,
      statusCode: checkRes.statusCode,
      responseTimeMs: checkRes.responseTimeMs,
      isUp: checkRes.isUp,
    },
  }))

  await dynamoClient.send(new UpdateCommand({
    TableName: TARGETS_TABLE,
    Key: { targetId },
    UpdateExpression: 'SET lastStatus = :lastStatus',
    ExpressionAttributeValues: { ':lastStatus': status },
  }))

  const previousStatus = typeof target.lastStatus === 'string'
    ? target.lastStatus.toLowerCase()
    : undefined

  if (previousStatus && previousStatus !== status) {
    console.log(`Instant check status transition for ${targetId}: ${previousStatus} -> ${status}`)
    await dynamoClient.send(new PutCommand({
      TableName: INCIDENTS_TABLE,
      Item: {
        targetId,
        startedAt: checkedAt,
        label: target.label,
        url: target.url,
        status,
        message: status === 'down' ? 'Target is down' : 'Target is back up',
      },
    }))
    await publishTransition(target, status)
  }

  const responseBody = {
    targetId,
    isUp: checkRes.isUp,
    statusCode: checkRes.statusCode,
    responseTimeMs: checkRes.responseTimeMs,
    checkedAt,
  }

  if (checkRes.error) {
    responseBody.error = checkRes.error
  }

  return response(200, responseBody)
}

exports.handler = async (event) => {
  try {
    const method = getMethod(event)
    if (method === 'OPTIONS') return response(200, { message: 'OK' })

    const ownerId = getOwnerId(event)
    if (!ownerId) return response(401, { message: 'Authentication required' })

    const path = getPath(event)
    const targetId = event.pathParameters?.targetId || (path.startsWith('/targets/') ? path.split('/')[2] : null)
    if (method === 'POST' && path === '/targets') return await createTarget(event, ownerId)
    if (method === 'GET' && path === '/targets') {
      return response(200, await getTargetsForOwner(ownerId))
    }
    if (method === 'POST' && (path === '/targets/{targetId}/check' || (path.startsWith('/targets/') && path.endsWith('/check') && targetId))) {
      return await checkTarget(event, ownerId, targetId)
    }
    if (method === 'DELETE' && (path === '/targets/{targetId}' || (path.startsWith('/targets/') && targetId && !path.endsWith('/check')))) {
      return await deleteTarget(event, ownerId, targetId)
    }
    if (method === 'GET' && path === '/history/{targetId}') {
      return await getHistory(event, ownerId, targetId)
    }
    if (method === 'GET' && path === '/incidents/{targetId}') {
      return await getIncidents(event, ownerId, targetId)
    }

    return response(404, { message: 'Route not found' })
  } catch (error) {
    if (error instanceof SyntaxError) return response(400, { message: 'Invalid JSON body' })
    console.error('API request failed:', error)
    return response(500, { message: 'Internal server error' })
  }
}
