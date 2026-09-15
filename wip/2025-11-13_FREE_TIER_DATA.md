# Free Tier Data for Google Cloud Services

**Date:** 2025-11-13
**Services:** Google Calendar API v3, Google Cloud Serverless Compute, Firebase

---

## Summary: Will We Pay for Compute?

**Short Answer:** Likely **FREE** for small-to-medium usage, but requires a billing account to be set up.

- **Google Calendar API v3**: Completely free, no per-request charges
- **Google Cloud Functions/Cloud Run**: Free tier is generous, likely covers development and light production use
- **Firebase**: Free Spark plan available, but limited quotas

---

## 1. Google Calendar API v3

### Pricing
**ALL USE IS FREE** - No additional cost for any API usage.

### Key Points
- No per-request charges
- No overage charges (exceeding quotas does not incur fees)
- Default quota: 1,000,000 queries per day
- Rate limits enforced:
  - Per minute per project
  - Per minute per project per user
- Exceeding quotas returns 403 or 429 status codes (rate limiting)
- Billing account required only if you need to request quota increases

### Quota Management Best Practices
- Use exponential backoff
- Implement push notifications instead of polling
- Distribute API requests evenly
- Test quota handling in separate test projects

### Source
[Google Calendar API Pricing Documentation](https://developers.google.com/calendar/pricing)

---

## 2. Google Cloud Serverless Compute

### A. Cloud Run (2nd Generation - Recommended)

#### Free Tier (per month, per region)
- **CPU**: 180,000 vCPU-seconds
- **Memory**: 360,000 GiB-seconds
- **Requests**: 2 million requests
- **Network Egress**: 1 GiB outbound data transfer (from North America)

#### After Free Tier (Tier 1 regions)
- **CPU**: $0.00002400 per vCPU-second
- **Memory**: $0.00000250 per GiB-second
- **Requests**: $0.40 per million requests

#### Key Points
- Free tier applies automatically to billing account
- No settings needed to "select" free tier
- Applies to request-based billing (CPU allocated only during requests)
- Most cost-effective for typical use cases

### B. Cloud Functions (1st Generation - Legacy)

#### Free Tier (per month)
- **Invocations**: 2 million free
- **Compute Time**:
  - 400,000 GB-seconds
  - 200,000 GHz-seconds
- **Network Egress**: 5 GB outbound data transfer

#### After Free Tier
- **Invocations**: $0.40 per million

#### Key Points
- Perpetual free tier (never expires)
- Billing account required even for free tier usage
- Google recommends using 2nd gen (Cloud Run) for new projects
- Free tier measured at Tier 1 pricing rates regardless of region

### Source
- [Cloud Functions Pricing](https://cloud.google.com/functions/pricing-1stgen)
- [Cloud Run Pricing](https://cloud.google.com/run/pricing)

---

## 3. Firebase

### Spark Plan (Free Tier)

#### Storage & Database
- **Cloud Firestore**:
  - Storage: 1 GB
  - Reads: 50,000 documents per day
  - Writes: 20,000 documents per day
  - Deletes: 20,000 documents per day

- **Realtime Database**:
  - Storage: 1 GB
  - Downloads: 10 GB per month

- **Cloud Storage**:
  - Storage: 1 GB
  - Downloads: 10 GB per month

#### Hosting
- **Storage**: 1 GB
- **Data Transfer**: 10 GB per month

#### Cloud Functions
- **Invocations**: 2 million per month
- (Inherits Cloud Functions free tier limits)

#### Authentication
- **Phone Auth**: First 10,000 verifications per month free
- **Most Sign-in Methods**: Unlimited free usage

#### Always-Free Products (Unlimited Usage)
- A/B Testing
- App Check
- App Distribution
- Authentication (most methods)
- Cloud Messaging (FCM)
- Crashlytics
- Firebase ML (model deployment)
- In-App Messaging
- Performance Monitoring
- Remote Config
- Google Analytics

#### Important Caveats
- Quotas reset daily around midnight Pacific Time
- If you exceed quota in a month, that specific product **shuts off** for remainder of month
- Some features have limitations (e.g., Crashlytics custom logging limited to 64kB)
- Ideal for prototypes, MVPs, and small projects

### Blaze Plan (Pay-as-you-go)
- Includes all Spark plan free quotas
- Pay only for usage beyond free tier
- Required for production apps expected to scale
- Billing account required

### Source
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Firebase Pricing Plans Documentation](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

---

## Billing Requirements

### All Services Require:
- A valid Google Cloud billing account to be set up
- Even for free tier usage
- Free tier credits applied automatically at end of billing period

### What This Means:
1. You need to provide payment information
2. You won't be charged if you stay within free tier limits
3. Free tier is perpetual (always free, not a trial)
4. Exceeding free tier results in charges or service shutoff (depending on service)

---

## Cost Estimation for Calendar Merge Service

### Typical Usage Scenario
Assuming:
- 50 users
- Each user syncs 2 calendars
- Average 100 events per calendar
- Syncs run every 15 minutes (96 times/day)

### Calendar API
- **Requests**: ~10,000 per day
- **Cost**: FREE (well within 1M daily quota)

### Cloud Run/Functions
- **Invocations**: ~5,000 per day = 150,000 per month
- **Cost**: FREE (under 2M free invocations)

### Firebase (if used)
- **Firestore Reads**: ~10,000 per day
- **Firestore Writes**: ~5,000 per day
- **Cost**: FREE (under daily quotas)

### **Total Estimated Cost: $0/month** for this usage level

### When You Might Start Paying
- 500+ active users
- More frequent sync intervals (< 5 minutes)
- Large event volumes (1000+ events per calendar)
- High-frequency webhook processing

Even then, costs would likely be minimal:
- Estimated $5-20/month for moderate scaling
- $50-100/month for significant production traffic

---

## Recommendations

1. **Start with Free Tier**: Plenty of headroom for development and initial launch
2. **Set up Billing Alerts**: Configure budget alerts in Google Cloud Console
3. **Monitor Usage**: Use Google Cloud Console to track quotas
4. **Optimize Early**: Implement caching, batch operations, and push notifications
5. **Plan for Scale**: Budget for costs if you expect rapid user growth

---

## Additional Resources

- [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
- [Firebase Console Usage Dashboard](https://console.firebase.google.com/)
- [Google Calendar API Quotas](https://developers.google.com/calendar/api/guides/quota)
