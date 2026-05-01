# 📱 Nard Integrated SMS Listener - Capacitor Guide

यह गाइड आपको बताएगी कि कैसे आप अपने मौजूदा React (Vite) वेब ऐप को **Capacitor** के जरिए एक नेटिव Android ऐप में बदल सकते हैं, और **Nard SMS Listener Plugin** बना सकते हैं जो बैकग्राउंड में पेमेंट SMS को पढ़कर आपके React ऐप (और Firebase) से कम्युनिकेट करेगा।

## चरण 1: Capacitor सेटअप करें

अपने प्रोजेक्ट के रूट फोल्डर में टर्मिनल खोलें और निम्नलिखित कमांड रन करें:

```bash
# 1. Capacitor कोर और CLI इंस्टॉल करें
npm install @capacitor/core
npm install -D @capacitor/cli

# 2. Capacitor इनिशियलाइज़ करें (App ID और Name सेट करें)
npx cap init NardApp com.nard.app --web-dir dist

# 3. अपने React ऐप को बिल्ड करें
npm run build

# 4. Android प्लेटफार्म जोड़ें
npm install @capacitor/android
npx cap add android

# 5. कोड सिंक करें
npx cap sync
```

## चरण 2: Android Manifest में अनुमतियां (Permissions) जोड़ें

`android/app/src/main/AndroidManifest.xml` फाइल को खोलें (आप `npx cap open android` रन करके Android Studio में खोल सकते हैं) और `<manifest>` टैग के अंदर ये अनुमतियां जोड़ें:

```xml
<!-- SMS Permissions -->
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.READ_SMS" />
<!-- For Foreground Service (Persistent Background Run) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Application tag के अंदर Foreground Service रजिस्टर करें -->
<application>
    ...
    <service
        android:name=".NardSmsForegroundService"
        android:enabled="true"
        android:exported="false"
        android:foregroundServiceType="dataSync" />
</application>
```

## चरण 3: Nard SMS Capacitor Plugin (Java) बनाएं

Android Studio में `android/app/src/main/java/com/nard/app/` फोल्डर में एक नया Java क्लास **`SmsListenerPlugin.java`** बनाएं:

```java
package com.nard.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.telephony.SmsMessage;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "NardSms")
public class SmsListenerPlugin extends Plugin {
    private BroadcastReceiver smsReceiver;

    @Override
    public void load() {
        smsReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Bundle bundle = intent.getExtras();
                if (bundle != null) {
                    Object[] pdus = (Object[]) bundle.get("pdus");
                    if (pdus != null) {
                        for (Object pdu : pdus) {
                            SmsMessage smsMessage = SmsMessage.createFromPdu((byte[]) pdu);
                            String sender = smsMessage.getDisplayOriginatingAddress();
                            String messageBody = smsMessage.getMessageBody();

                            // 1. बैंक सेंडर चेक करें (उदा: SBI, HDFC, ICICI, PAYTM)
                            if (sender != null && sender.matches(".*(SBI|HDFC|ICICI|PAYTM|UPI).*")) {
                                parseAndNotifyReact(sender, messageBody);
                            }
                        }
                    }
                }
            }
        };
        getContext().registerReceiver(smsReceiver, new IntentFilter("android.provider.Telephony.SMS_RECEIVED"));
    }

    private void parseAndNotifyReact(String sender, String message) {
        // Regex for Amount: Rs. 500.00 या INR 1000
        Pattern amountPattern = Pattern.compile("(?i)(Rs\\.?|INR)\\s*(\\d+(?:\\.\\d{1,2})?)");
        Matcher amountMatcher = amountPattern.matcher(message);

        // Regex for UTR/TxnID: 12 डिजिट का UTR (उदा: 312345678901)
        Pattern utrPattern = Pattern.compile("\\b\\d{12}\\b");
        Matcher utrMatcher = utrPattern.matcher(message);

        if (amountMatcher.find() && utrMatcher.find()) {
            JSObject ret = new JSObject();
            ret.put("sender", sender);
            ret.put("amount", amountMatcher.group(2));
            ret.put("utr", utrMatcher.group(0));
            ret.put("fullMessage", message);

            // React को ईवेंट भेजें!
            notifyListeners("onPaymentSmsReceived", ret);
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        getContext().unregisterReceiver(smsReceiver);
    }
}
```

अपने `MainActivity.java` में इस प्लगइन को रजिस्टर करना न भूलें:

```java
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(SmsListenerPlugin.class);
  }
}
```

## चरण 4: Background Foreground Service (Nard Auto-Sync)

एक और क्लास **`NardSmsForegroundService.java`** बनाएं जो ऐप बंद होने पर भी बैटरी सेवर को बाईपास करके सर्विस को जिन्दा रखे:

```java
package com.nard.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

public class NardSmsForegroundService extends Service {
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();
        Notification notification = new Notification.Builder(this, "NARD_SYNC_CHANNEL")
                .setContentTitle("Nard: Auto-Payment Sync Active")
                .setContentText("Listening for incoming bank transactions...")
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setOngoing(true)
                .build();

        startForeground(1, notification);
        return START_STICKY; // सर्विस बंद होने पर ऑटो-रीस्टार्ट
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    "NARD_SYNC_CHANNEL",
                    "Nard Auto-Sync Background Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            getSystemService(NotificationManager.class).createNotificationChannel(serviceChannel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
```

## चरण 5: React (App.tsx) में Plugin को सुनना

नीचे दिया गया कोड आपको अपने React कंपोनेंट (जैसे `App.tsx` या किसी हुक) में डालना है:

```tsx
import { registerPlugin } from "@capacitor/core";
import { useEffect } from "react";

// प्लगइन का इंटरफ़ेस
interface SmsPluginType {
  addListener(
    eventName: "onPaymentSmsReceived",
    listenerFunc: (info: {
      sender: string;
      amount: string;
      utr: string;
      fullMessage: string;
    }) => void,
  ): Promise<any>;
}

// प्लगइन लोड करें
const NardSms = registerPlugin<SmsPluginType>("NardSms");

export function useNardSmsListener() {
  useEffect(() => {
    // बैकग्राउंड SMS लिसनर
    const setupListener = async () => {
      await NardSms.addListener("onPaymentSmsReceived", async (data) => {
        console.log("NARD PAYMENT DETECTED:", data);

        // Firebase Cloud Function को तुरंत POST करें
        try {
          await fetch(
            "https://[YOUR_FIREBASE_REGION]-[YOUR_PROJECT].cloudfunctions.net/processPayment",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                API_KEY: "YOUR_NARD_SECURE_KEY",
              },
              body: JSON.stringify({
                utr: data.utr,
                amount: data.amount,
                sender: data.sender,
              }),
            },
          );

          // यहाँ आप React state अपडेट कर सकते हैं या Confetti चला सकते हैं!
          alert(
            `Success! Payment of Rs.${data.amount} received via UTR: ${data.utr}`,
          );
        } catch (error) {
          console.error("Firebase Sync Failed", error);
        }
      });
    };

    setupListener();
  }, []);
}
```

## इग्नोर बैटरी ऑप्टिमाइजेशन (Ignore Battery Optimization)

अपने Android ऐप में यूज़र को बैटरी सेवर बंद करने के लिए प्रॉम्प्ट करने का कोड (ताकि लिसनर मरे नहीं):

```java
Intent intent = new Intent();
String packageName = getPackageName();
PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
if (!pm.isIgnoringBatteryOptimizations(packageName)) {
    intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
    intent.setData(Uri.parse("package:" + packageName));
    startActivity(intent);
}
```

आप इस नेटिव इंटेंट को Capacitor के ज़रिये एक मेथड बनाकर React से ट्रिगर कर सकते हैं।
