
# ⚡ PulseWatch Backend

### Serverless AWS Backend for Website & API Uptime Monitoring

PulseWatch Backend provides the serverless backend services for the PulseWatch uptime monitoring platform.

It handles monitor management, instant health checks, monitoring history, incident tracking, authentication, scheduled monitoring, and email notifications using AWS services.

---

## 🎥 Project Demo

[Watch the PulseWatch Demo on YouTube](https://www.youtube.com/watch?v=lCfbnnLQq3o)

## 🎨 Frontend Repository

[PulseWatch Frontend](https://github.com/mahi-8758/pulsewatch-frontend)

## ☁️ Infrastructure Repository

[PulseWatch Infrastructure](https://github.com/mahi-8758/pulsewatch-infrastructure)

---

## 🏗️ Backend Architecture

```text
                         ┌─────────────────────┐
                         │    React Frontend   │
                         └──────────┬──────────┘
                                    │
                              HTTPS + JWT
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Amazon API        │
                         │      Gateway        │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     API Lambda      │
                         │  pulsewatch-api     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │       Amazon DynamoDB        │
                    │                              │
                    │  MonitorTargets              │
                    │  CheckResults                │
                    │  Incidents                   │
                    └──────────────────────────────┘


              Automatic Monitoring
                       │
                       ▼
             ┌─────────────────────┐
             │  Amazon EventBridge │
             │     Every 5 min     │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │   Checker Lambda    │
             │ pulsewatch-checker  │
             └──────────┬──────────┘
                        │
                ┌───────┴────────┐
                ▼                ▼
          ┌───────────┐    ┌─────────────┐
          │ DynamoDB  │    │  Amazon SNS │
          │ Results & │    │ Email Alerts│
          │ Incidents │    └─────────────┘
          └───────────┘
```

---

## ☁️ AWS Services

| AWS Service | Purpose |
|---|---|
| **AWS Lambda** | Runs API and monitoring logic |
| **Amazon API Gateway** | Exposes REST API endpoints |
| **Amazon DynamoDB** | Stores monitors, check results and incidents |
| **Amazon Cognito** | Handles user authentication |
| **Amazon EventBridge** | Triggers monitoring every 5 minutes |
| **Amazon SNS** | Sends monitoring email notifications |
| **Amazon CloudWatch** | Monitors Lambda and application errors |
| **AWS IAM** | Controls permissions between AWS services |

---

## ⚙️ Lambda Functions

### `pulsewatch-api`

Handles authenticated API requests from the frontend.

Responsibilities:

- Create monitors
- Retrieve monitors
- Delete monitors
- Run instant checks
- Retrieve monitoring history
- Retrieve incidents
- Validate authenticated users
- Verify monitor ownership

### `pulsewatch-checker`

Performs automatic uptime monitoring.

Responsibilities:

- Scan active monitors
- Check monitored URLs
- Measure response time
- Determine UP / DOWN status
- Store check results
- Detect status changes
- Create incidents
- Publish SNS notifications

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/targets` | Create a monitor |
| `GET` | `/targets` | Get user's monitors |
| `DELETE` | `/targets/{targetId}` | Delete a monitor |
| `POST` | `/targets/{targetId}/check` | Run an instant health check |
| `GET` | `/history/{targetId}` | Get monitoring history |
| `GET` | `/incidents/{targetId}` | Get monitor incidents |

Protected endpoints require a valid **Amazon Cognito ID token**.

---

## 🔐 Authentication & Authorization

PulseWatch uses **Amazon Cognito** for user authentication.

```text
User
 │
 ▼
Amazon Cognito
 │
 ▼
JWT ID Token
 │
 ▼
API Gateway
 │
 ▼
API Lambda
 │
 ▼
Validate User / Ownership
 │
 ▼
DynamoDB
```

The backend uses the authenticated Cognito user's `sub` value as the user identifier.

This ensures that users can access and manage only their own monitors.

---

## ⚡ Instant Check

The backend supports manually triggered health checks.

```text
Frontend
   │
   │ POST /targets/{targetId}/check
   ▼
API Gateway
   │
   ▼
API Lambda
   │
   ▼
Target URL
   │
   ▼
Check Result
   │
   ├── Status
   ├── HTTP Status Code
   ├── Response Time
   └── Checked At
```

Example response:

```json
{
  "targetId": "example-id",
  "isUp": true,
  "statusCode": 200,
  "responseTimeMs": 142,
  "checkedAt": "2026-09-07T12:00:00.000Z"
}
```

---

## ⏱️ Automatic Monitoring

PulseWatch automatically checks registered monitors every **5 minutes**.

```text
Amazon EventBridge
        │
        │ rate(5 minutes)
        ▼
Checker Lambda
        │
        ▼
MonitorTargets
        │
        ▼
Check URLs
        │
        ├───────────────┐
        ▼               ▼
   CheckResults      Incidents
                        │
                        ▼
                   Amazon SNS
                        │
                        ▼
                   Email Alert
```

### Status Changes

```text
UP → DOWN
🚨 Downtime notification

DOWN → UP
✅ Recovery notification

UP → UP
No notification

DOWN → DOWN
No repeated notification
```

---

## 🗄️ DynamoDB Tables

### MonitorTargets

Stores the websites and APIs being monitored.

```text
Target ID
Owner ID
Label
URL
Status
Created At
```

### CheckResults

Stores individual monitoring results.

```text
Target ID
Status
HTTP Status Code
Response Time
Checked At
```

### Incidents

Stores monitor status changes and incidents.

```text
Target ID
Incident Type
Status
Started At
Resolved At
```

---

## 📁 Project Structure

```text
pulsewatch-backend/
│
├── lambda/
│   ├── api/
│   │   └── api.js
│   │
│   └── checker/
│       └── checker.js
│
├── package.json
├── package-lock.json
└── README.md
```

---

## 🛠️ Technology Stack

### Runtime

- Node.js
- JavaScript

### AWS

- AWS Lambda
- Amazon API Gateway
- Amazon DynamoDB
- Amazon Cognito
- Amazon EventBridge
- Amazon SNS
- Amazon CloudWatch
- AWS IAM

---

## 🔧 Environment Variables

### API Lambda

```text
TARGETS_TABLE=MonitorTargets
RESULTS_TABLE=CheckResults
INCIDENTS_TABLE=Incidents
```

### Checker Lambda

```text
TARGETS_TABLE=MonitorTargets
RESULTS_TABLE=CheckResults
INCIDENTS_TABLE=Incidents
SNS_TOPIC_ARN=YOUR_SNS_TOPIC_ARN
```

> Environment values and AWS credentials should never be committed to the repository.

---

## 🚀 Deployment

The backend is deployed using AWS Lambda and API Gateway.

The infrastructure repository contains the AWS deployment scripts:

[PulseWatch Infrastructure](https://github.com/mahi-8758/pulsewatch-infrastructure)

The deployment includes:

1. DynamoDB tables
2. IAM roles and permissions
3. Lambda functions
4. EventBridge scheduling
5. API Gateway
6. Cognito authentication
7. SNS notifications
8. CloudWatch monitoring

---

## 🧪 Testing

### Manual Lambda Check

The monitoring Lambda can be invoked manually using the AWS CLI:

```bash
aws lambda invoke \
  --function-name pulsewatch-checker \
  response.json \
  --region ap-south-1
```

View the response:

```bash
cat response.json
```

---

## 🔒 Security

PulseWatch follows AWS security best practices:

- Amazon Cognito authentication
- JWT-based API authorization
- User ownership validation
- IAM-based AWS permissions
- Separate Lambda execution roles
- Environment variables for configuration
- Protected API endpoints
- No AWS credentials stored in source code

> Never commit AWS access keys, secret keys, Cognito tokens, passwords, or other sensitive credentials to GitHub.

---

## 📊 Monitoring & Alerts

PulseWatch uses Amazon CloudWatch to monitor backend errors.

The monitoring system also uses Amazon SNS to send email notifications when a monitored service changes state.

```text
Website Status
      │
      ▼
Checker Lambda
      │
      ▼
Status Change
      │
      ▼
Amazon SNS
      │
      ▼
Email Notification
```

---

## 🎯 Project Goals

The backend demonstrates practical implementation of:

- Serverless architecture
- REST API development
- AWS Lambda
- API Gateway
- DynamoDB data modeling
- Cognito authentication
- Event-driven architecture
- Automated uptime monitoring
- Incident management
- SNS notifications
- CloudWatch monitoring
- AWS IAM security

---

## 🚀 Future Improvements

- 📊 Advanced uptime analytics
- 📈 Detailed availability reports
- 🌍 Multi-region monitoring
- 🔔 Additional notification channels
- ⏱️ Custom monitoring intervals
- 🤖 CI/CD deployment pipeline
- 📝 More automated backend tests
- 📊 Advanced CloudWatch dashboards

---

## 🔗 Related Repositories

| Repository | Description |
|---|---|
| [Frontend](https://github.com/mahi-8758/pulsewatch-frontend) | React + Vite frontend |
| [Backend](https://github.com/mahi-8758/pulsewatch-backend) | AWS Lambda backend |
| [Infrastructure](https://github.com/mahi-8758/pulsewatch-infrastructure) | AWS infrastructure and deployment |

---

## 👨‍💻 Author

**Mahi Kumar**

GitHub: [@mahi-8758](https://github.com/mahi-8758)

---

## ⭐ Project

If you find PulseWatch useful, consider giving the project a ⭐ on GitHub.

---
