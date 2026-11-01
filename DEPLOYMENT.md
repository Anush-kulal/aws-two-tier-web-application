# Deployment and Architecture Runbook

This document describes the AWS environment that was actually deployed and provides repeatable steps for the application example in [application/](application/README.md).

## 1. Architecture at a glance

**Request path**

`User -> Internet-facing ALB :80 -> EC2 Node.js application :3000 -> private RDS MySQL :3306`

| Layer / service | Actual deployment |
|---|---|
| Region | Asia Pacific (Mumbai), `ap-south-1` |
| VPC | `TwoTier-Project-VPC`, `10.0.0.0/16` |
| Public subnet A | `10.0.1.0/24`, Availability Zone `ap-south-1a` |
| Public subnet B | `10.0.2.0/24`, Availability Zone `ap-south-1b` |
| Private app subnet A | `10.0.11.0/24`, created but currently unused |
| Private app subnet B | `10.0.12.0/24`, created but currently unused |
| Private DB subnet A | `10.0.21.0/24`, part of the RDS DB subnet group |
| Private DB subnet B | `10.0.22.0/24`, part of the RDS DB subnet group |
| Application load balancer | `TwoTier-App-ALB`, internet-facing, HTTP listener on port 80 |
| Target group | `TwoTier-App-TG`, HTTP port 3000, health-check path `/health` |
| Application instance 1 | `TwoTier-App-Server-1`, public subnet A, `ap-south-1a` |
| Application instance 2 | `TwoTier-App-Server-2`, public subnet B, `ap-south-1b` |
| EC2 instance type / OS | Two `t3.micro` instances running Amazon Linux 2023 |
| Application runtime | Node.js 22 with Express |
| Database | `two-tier-mysql-db`, Amazon RDS for MySQL, private, Single-AZ |
| Application database | `studentdb` |

The RDS DB subnet group contains two private DB subnets, but the RDS DB instance itself is Single-AZ. The presence of two subnets in a DB subnet group does **not** mean that the database is running in Multi-AZ mode.

The two private application subnets were created during initial setup but do not host the application instances in this deployment. Both EC2 application instances run in the public subnets. The architecture diagram intentionally shows the resources that are in use.

## 2. Network and routing

### Public route table

The public route table `TwoTier-Public-RT` is associated with both public application subnets. It contains:

- VPC local route: `10.0.0.0/16 -> local`
- Internet route: `0.0.0.0/0 -> TwoTier-Project-IGW`

The two EC2 instances have public IPv4 addresses. This allows the internet-facing ALB and authorized administration access to reach the instances, subject to the security-group rules.

### Private route table

The private route table `TwoTier-Private-RT` is associated with the private application and private DB subnets. It contains the VPC local route and no default internet route. No NAT Gateway was configured.

The RDS database does not need a public IP address or a direct internet route for the application to connect to it. The EC2 instances reach the database over the VPC's private network.

## 3. Security-group traffic

| Security group | Inbound source | Protocol / port | Purpose |
|---|---|---|---|
| `TwoTier-ALB-SG` | `0.0.0.0/0` | HTTP TCP 80 | Accept web requests from users |
| `TwoTier-EC2-SG` | `TwoTier-ALB-SG` | Custom TCP 3000 | Allow ALB-to-application traffic |
| `TwoTier-EC2-SG` | Administrator's configured source and EC2 Instance Connect prefix list | SSH TCP 22 | Administrative access |
| `TwoTier-RDS-SG` | `TwoTier-EC2-SG` | MySQL TCP 3306 | Allow application-to-database traffic |

The important distinction is that **routing determines whether a network path exists**, while **security groups determine whether traffic is allowed**. The application port 3000 is allowed from the ALB security group, not from the general internet. SSH is a separate administrative rule.

## 4. Application configuration

The application example in `application/` uses:

- Node.js and Express to serve the website and API.
- `mysql2` to communicate with MySQL.
- `dotenv` to load database configuration from environment variables.
- A static HTML page for the student registration form and student list.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | ALB target-group health check |
| GET | `/api/students` | Return student records |
| POST | `/api/students` | Validate and register a student |

The browser interface is served by the same Express application. Therefore, this is documented as a **two-tier application**: the application tier (web interface, Express server and API) and the database tier (RDS MySQL). The ALB is the traffic entry point and load distributor, not a third application tier.

## 5. Database setup

The example schema is in `application/database/schema.sql`. Connect to the RDS endpoint from an EC2 instance using a MySQL client and a database account with the required privileges:

```bash
mysql -h YOUR_RDS_ENDPOINT -P 3306 -u YOUR_DB_USER -p < database/schema.sql
```

The SQL script creates the `studentdb` database if it does not exist, then creates the `students` table with `id`, `name`, `email`, and `course` columns if the table does not exist.

Use the actual endpoint and database username from your AWS configuration. Enter the password at the interactive prompt; do not place it in shell history or commit it to Git.

## 6. Run the application on an EC2 instance

The following commands are a reproducible deployment example for Amazon Linux 2023. Run them on each application instance. The example assumes Node.js 22 is installed and available as `node-22` / `npm-22`, as in the documented deployment.

Clone the repository and copy the application files into the working directory used by the systemd service:

```bash
git clone https://github.com/Anush-kulal/aws-two-tier-web-application.git
sudo mkdir -p /home/ec2-user/two-tier-app
sudo cp -r aws-two-tier-web-application/application/. /home/ec2-user/two-tier-app/
sudo chown -R ec2-user:ec2-user /home/ec2-user/two-tier-app
cd /home/ec2-user/two-tier-app
npm-22 install --omit=dev
```

Create the environment file:

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to the values for the RDS instance. Do not commit the populated `.env` file.

### systemd service

Create `/etc/systemd/system/two-tier-app.service`:

```ini
[Unit]
Description=Two-Tier Student Management Node.js Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/two-tier-app
EnvironmentFile=/home/ec2-user/two-tier-app/.env
ExecStart=/usr/bin/node-22 /home/ec2-user/two-tier-app/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now two-tier-app
sudo systemctl status two-tier-app
```

Check the health endpoint locally:

```bash
curl http://localhost:3000/health
```

Repeat on the second EC2 instance. Both instances should return HTTP 200 from `/health` before relying on the ALB health check.

## 7. Load-balancer validation

In the EC2 console:

1. Open **Target Groups** and select `TwoTier-App-TG`.
2. Confirm the target type is Instances and the protocol/port is HTTP :3000.
3. Confirm the health-check path is `/health`.
4. Open the **Targets** tab and confirm both EC2 instances are registered and healthy.
5. Open `TwoTier-App-ALB` and use its DNS name with `http://` to test the student page.

The project evidence captured two healthy targets. Health can change after a deployment or when instances are stopped, so check the live console before demonstrating the application.

## 8. Validation checklist

- [ ] Both EC2 instances are running in separate Availability Zones.
- [ ] The Node.js service is enabled and active on both instances.
- [ ] `GET /health` returns HTTP 200 on both instances.
- [ ] Both instances are registered and healthy in `TwoTier-App-TG`.
- [ ] The RDS database is not publicly accessible.
- [ ] The EC2 security group allows application port 3000 from the ALB security group.
- [ ] The RDS security group allows port 3306 from the EC2 security group.
- [ ] A student can be registered through the ALB URL.
- [ ] The registered student appears in the application list after reloading.

## 9. Operational and security notes

- The application listener is HTTP :80 in this deployment; HTTPS/TLS termination was not part of the documented implementation.
- The RDS instance is Single-AZ; database Multi-AZ failover is not configured.
- No NAT Gateway was configured.
- Do not commit `.env`, database passwords, AWS access keys, private keys, or other credentials.
- Restrict SSH to trusted administrator sources. Avoid leaving broad SSH ingress rules in place.
- Take a database snapshot before destructive database maintenance.
- Stopping EC2 does not remove EBS storage charges. A stopped RDS instance still retains billable storage and is automatically restarted by AWS after the supported stop period.

## 10. Screenshot evidence

The `screenshots/` directory contains the evidence in the order used in the repository README:

1. Internet-facing Application Load Balancer.
2. Target-group configuration and target health.
3. RDS MySQL database.
4. Student Management System interface.
5. EC2 instances in two Availability Zones.

The architecture diagram is `screenshots/aws-two-tier-architecture.svg`.
