const http = require('http')
const https = require('https')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb')
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider')

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const sesClient = new SESClient({})
const cognitoClient = new CognitoIdentityProviderClient({})

const TARGETS_TABLE = process.env.TARGETS_TABLE || 'MonitorTargets'
const RESULTS_TABLE = process.env.RESULTS_TABLE || 'CheckResults'
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'Incidents'
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.ALERT_EMAIL
const USER_POOL_ID = process.env.USER_POOL_ID
const REQUEST_TIMEOUT_MS = 8000

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

async function scanAllTargets() {
  const targets = []
  let ExclusiveStartKey

  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: TARGETS_TABLE,
      ExclusiveStartKey,
    }))
    targets.push(...(result.Items || []))
    ExclusiveStartKey = result.LastEvaluatedKey
  } while (ExclusiveStartKey)

  return targets
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

async function processTarget(target) {
  console.log(`Checking target ${target.targetId}: ${target.label} (${target.url})`)
  const result = await checkUrl(target.url)
  const status = result.isUp ? 'up' : 'down'
  const checkedAt = new Date().toISOString()
  const previousStatus = typeof target.lastStatus === 'string'
    ? target.lastStatus.toLowerCase()
    : undefined

  console.log(`Result for ${target.targetId}: ${status}, HTTP ${result.statusCode}, ${result.responseTimeMs}ms`)
  if (result.error) console.error(`Check error for ${target.targetId}: ${result.error}`)

  await dynamoClient.send(new PutCommand({
    TableName: RESULTS_TABLE,
    Item: {
      targetId: target.targetId,
      checkedAt,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      isUp: result.isUp,
    },
  }))

  await dynamoClient.send(new UpdateCommand({
    TableName: TARGETS_TABLE,
    Key: { targetId: target.targetId },
    UpdateExpression: 'SET lastStatus = :lastStatus',
    ExpressionAttributeValues: { ':lastStatus': status },
  }))

  if (previousStatus && previousStatus !== status) {
    console.log(`Status transition for ${target.targetId}: ${previousStatus} -> ${status}`)
    await dynamoClient.send(new PutCommand({
      TableName: INCIDENTS_TABLE,
      Item: {
        targetId: target.targetId,
        startedAt: checkedAt,
        label: target.label,
        url: target.url,
        status,
        message: status === 'down' ? 'Target is down' : 'Target is back up',
      },
    }))
    await publishTransition(target, status)
  } else if (!previousStatus) {
    console.log(`Initial status established for ${target.targetId}: ${status}`)
  }
}

exports.handler = async () => {
  const targets = await scanAllTargets()
  console.log(`Starting checker cycle for ${targets.length} target(s)`)

  for (const target of targets) {
    try {
      await processTarget(target)
    } catch (error) {
      console.error(`Checker failed for target ${target.targetId}:`, error)
    }
  }

  return { checked: targets.length }
}
