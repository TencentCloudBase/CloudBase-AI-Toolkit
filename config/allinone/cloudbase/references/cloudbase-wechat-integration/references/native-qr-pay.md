# Native QR-Code Pay

Official docs:

- `https://docs.cloudbase.net/integration/wechat-pay-native/index.md`
- `https://docs.cloudbase.net/integration/usage/index.md`

## When To Use

Use this reference for PC/Web checkout, Native WeChat Pay, QR-code payment, or flows where the generated function returns a payment `code_url` for the frontend to render as a QR code.

## Agent Must Know

- Native payment does not use `wx.requestPayment` or `WeixinJSBridge`.
- The generated payment function creates an order and returns a QR-code URL such as `code_url`.
- The frontend renders the QR code and polls or subscribes to payment state.
- Fulfillment must wait for callback or query confirmation.

## Minimal Contract

Typical Native flow:

1. Backend or frontend calls the generated payment function to create a Native order.
2. The generated function returns `code_url`.
3. The frontend renders `code_url` as a QR code.
4. The user scans the QR code in WeChat.
5. The app polls order status or waits for callback-driven state changes.

Example frontend shape:

```js
async function createNativePayment(orderId) {
  const response = await fetch("/api/pay/native-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  const data = await response.json();
  if (!data.code_url) {
    throw new Error("Missing Native payment code_url");
  }
  return data.code_url;
}
```

In CloudBase frontend-only projects, the API wrapper can call the generated HTTP function directly if the access model and CORS/security rules are appropriate. For production, prefer a trusted backend or generated function extension that validates amount and order ownership.

## Implementation Checklist

- Confirm this is Native QR-code payment, not JSAPI or Mini Program payment.
- Confirm generated function name and Native order path.
- Generate a unique order number and persist pending state.
- Validate amount and goods details before creating payment.
- Render QR code from `code_url`.
- Poll order status with backoff, or update UI from callback-driven status.
- Expire stale QR codes and handle closed orders.

## Do Not

- Do not call `wx.requestPayment` for Native QR-code pay.
- Do not fulfill the order when the QR code is generated.
- Do not rely on frontend polling alone if callback data says otherwise.
