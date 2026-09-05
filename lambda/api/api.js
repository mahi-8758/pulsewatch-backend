const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb')
const { v4: uuidv4 } = require('uuid')

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const TARGETS_TABLE = process.env.TARGETS_TABLE || 'MonitorTargets'
const RESULTS_TABLE = process.env.RESULTS_TABLE || 'CheckResults'
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'Incidents'

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

  const target = {
    targetId: uuidv4(),
    ownerId,
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

exports.handler = async (event) => {
  try {
    const method = getMethod(event)
    if (method === 'OPTIONS') return response(200, { message: 'OK' })

    const ownerId = getOwnerId(event)
    if (!ownerId) return response(401, { message: 'Authentication required' })

    const path = getPath(event)
    const targetId = event.pathParameters?.targetId
    if (method === 'POST' && path === '/targets') return await createTarget(event, ownerId)
    if (method === 'GET' && path === '/targets') {
      return response(200, await getTargetsForOwner(ownerId))
    }
    if (method === 'DELETE' && (path === '/targets/{targetId}' || (path.startsWith('/targets/') && targetId))) {
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
