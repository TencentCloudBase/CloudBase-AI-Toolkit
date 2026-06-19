# Official Account JSAPI Pay

Official docs:

- `https://docs.cloudbase.net/integration/wechat-pay-jsapi-h5/index.md`
- `https://docs.cloudbase.net/integration/wechat-official-oauth/index.md`
- `https://docs.cloudbase.net/integration/usage/index.md`

## When To Use

Use this reference for WeChat Official Account webpage payment, JSAPI payment inside the WeChat browser, H5 checkout that calls `WeixinJSBridge.invoke`, and flows that need an official-account openid before creating the payment order.

## Agent Must Know

- JSAPI payment requires the page to run in the WeChat built-in browser.
- The payer openid must belong to the correct Official Account, not the Mini Program openid.
- Official Account OAuth is commonly needed before JSAPI order creation.
- The generated payment function name and routes must be read from the user's Integration Center setup.
- Final business state still depends on payment callback or order query.

## Minimal Contract

Typical JSAPI flow:

1. Redirect the user through Official Account OAuth to get an openid.
2. Call the generated payment function to create a JSAPI order.
3. Pass returned payment parameters to `WeixinJSBridge.invoke("getBrandWCPayRequest", ...)`.
4. Use payment callback or order query to confirm paid state.

Example invocation shape:

```js
function invokeJsapiPay(paymentParams) {
  return new Promise((resolve, reject) => {
    if (!window.WeixinJSBridge) {
      reject(new Error("WeixinJSBridge is unavailable; open this page in WeChat"));
      return;
    }

    window.WeixinJSBridge.invoke(
      "getBrandWCPayRequest",
      paymentParams,
      (res) => {
        if (res.err_msg === "get_brand_wcpay_request:ok") {
          resolve(res);
          return;
        }
        reject(new Error(res.err_msg || "JSAPI payment failed"));
      },
    );
  });
}
```

Adjust request paths and parameter names to the generated function contract and official docs.

## Implementation Checklist

- Confirm the app is an Official Account web flow, not a Mini Program page.
- Confirm the page runs inside WeChat before showing JSAPI checkout.
- Obtain the Official Account openid through OAuth before order creation.
- Confirm merchant account binding matches the Official Account AppID.
- Persist pending order state before invoking payment.
- Confirm paid state through callback or query before fulfillment.

## Do Not

- Do not reuse Mini Program openid for Official Account JSAPI pay.
- Do not show JSAPI checkout in a normal desktop browser.
- Do not put AppSecret, merchant private keys, or APIv3 keys in browser code.
