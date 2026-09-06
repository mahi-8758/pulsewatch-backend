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