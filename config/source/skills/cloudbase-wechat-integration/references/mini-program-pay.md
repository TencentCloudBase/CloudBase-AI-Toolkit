# Mini Program WeChat Pay

Official docs:

- `https://docs.cloudbase.net/integration/wechat-pay-miniprogram/index.md`
- `https://docs.cloudbase.net/integration/usage/index.md`

## When To Use

Use this reference for WeChat Mini Program payment flows on CloudBase, including 小程序微信支付, `wx.cloud.callHTTPFunction`, `wx.requestPayment`, Mini Program openid handling, payment callbacks, refunds, and order-status sync.

## Agent Must Know

- The CloudBase Integration Center generated payment function is an HTTP cloud function.
- `pay-common` is an example function name; use the actual generated function name.
- Mini Program openid can be injected by CloudBase when calling through the Mini Program cloud function path.
- The client-side `wx.requestPayment` success callback is not the final business truth.
- Fulfillment must be driven by callback handling or explicit order query.

## Minimal Contract

Typical Mini Program flow:

1. Mini Program calls the generated payment function over `wx.cloud.callHTTPFunction`.
2. The request path targets the generated payment route, commonly an order-creation path such as `/wx-pay/wxpay_order`.
3. The generated function returns payment parameters for `wx.requestPayment`.
4. The Mini Program invokes `wx.requestPayment`.
5. Backend callback or query logic confirms paid state before updating business data.

Example shape:

```js
const functionName = "replace-with-generated-payment-function";

const orderResult = await wx.cloud.callHTTPFunction({
  name: functionName,
  path: "/wx-pay/wxpay_order",
  data: {
    out_trade_no: orderId,
    description: "Order payment",
    amount: {
      total: 1,
      currency: "CNY",
    },
  },
});

// callHTTPFunction returns { data, statusCode, header }
// The generated function typically returns { code, data, message }
// Payment params are under orderResult.data.data
const payment = orderResult.data?.data;
if (!payment) {
  throw new Error("Missing payment parameters from CloudBase payment function");
}

await wx.requestPayment(payment);
```

Adjust field names to the official docs and the generated function contract before using in production.

## Implementation Checklist

- Confirm `wx.cloud.init({ env })` uses the canonical full CloudBase environment ID.
- Confirm the Mini Program AppID matches the WeChat Pay merchant binding.
- Confirm the generated function name and path in CloudBase console.
- Generate a unique `out_trade_no` on the backend or trusted business layer.
- Validate amount and product data server-side before creating payment.
- Persist pending order state before initiating payment.
- Handle payment callback idempotently.
- Query the order after client payment success before showing final fulfillment state.

## Common Extensions

- Write order and payment status to CloudBase database.
- Add an idempotency key on `out_trade_no`.
- Add fulfillment only after callback/query confirms success.
- Add refund initiation and refund callback handling if the product supports refunds.

## Do Not

- Do not place merchant keys or certificates in Mini Program code.
- Do not trust client-provided amount without server-side validation.
- Do not assume frontend success means the order is paid.
- Do not hard-code `pay-common` if the console generated a different function name.
