# Monitoring and Observability via Command Line

This guide describes how to monitor your deployed Google Cloud Functions and Cloud Run services **solely using the command line**. You can view logs, check status, and set up basic alerts without using the web console.

---

## Prerequisites
- Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud` CLI)
- Authenticate: `gcloud auth login`
- Set your project: `gcloud config set project <YOUR_PROJECT_ID>`

---

## 1. Viewing Logs

### **Cloud Functions**
- **Show recent logs:**
  ```sh
  gcloud functions logs read <FUNCTION_NAME>
  ```
- **Filter logs by severity or text:**
  ```sh
  gcloud functions logs read <FUNCTION_NAME> --severity=ERROR
  gcloud functions logs read <FUNCTION_NAME> --filter="textPayload:Sync"
  ```
- **Tail logs in real time:**
  ```sh
  gcloud functions logs tail <FUNCTION_NAME>
  ```
- **Export logs to file:**
  ```sh
  gcloud functions logs read <FUNCTION_NAME> > function-logs.txt
  ```

### **Cloud Run**
- **Show recent logs:**
  ```sh
  gcloud run services logs read <SERVICE_NAME>
  ```

---

## 2. Checking Status and Metrics

- **List deployed functions:**
  ```sh
  gcloud functions list
  ```
- **Describe a function (details, last deployment, trigger):**
  ```sh
  gcloud functions describe <FUNCTION_NAME>
  ```
- **List Cloud Run services:**
  ```sh
  gcloud run services list
  ```
- **Describe Cloud Run service:**
  ```sh
  gcloud run services describe <SERVICE_NAME>
  ```

---

## 3. Setting Up Alerts (Advanced)

You can create alerting policies using the CLI. Example for error rate:

```sh
gcloud monitoring policies create \
  --notification-channels=<CHANNEL_ID> \
  --condition-display-name="High Error Rate" \
  --condition-filter='resource.type="cloud_function" AND metric.type="cloudfunctions.googleapis.com/function/execution_count" AND metric.label.status="error"'
```

See [GCP CLI Alerting Docs](https://cloud.google.com/monitoring/alerts/using-alerting) for details.

---

## 4. Useful Commands Summary

| Action                | Command Example                                      |
|-----------------------|-----------------------------------------------------|
| View logs             | `gcloud functions logs read <FUNCTION_NAME>`         |
| Tail logs             | `gcloud functions logs tail <FUNCTION_NAME>`         |
| Filter logs           | `gcloud functions logs read <FUNCTION_NAME> --filter="textPayload:Sync"` |
| List functions        | `gcloud functions list`                              |
| Describe function     | `gcloud functions describe <FUNCTION_NAME>`          |
| View Cloud Run logs   | `gcloud run services logs read <SERVICE_NAME>`       |
| Export logs           | `gcloud functions logs read <FUNCTION_NAME> > logs.txt` |
| Set up alerts         | `gcloud monitoring policies create ...`              |

---

## 5. Tips
- Use log filtering to quickly find actions (e.g., syncs, errors, event creation).
- Tail logs during debugging or live monitoring.
- Export logs for offline analysis or sharing.
- Set up alerts for proactive notification of issues.

---

For more details, see the [Google Cloud CLI documentation](https://cloud.google.com/sdk/gcloud/reference).
