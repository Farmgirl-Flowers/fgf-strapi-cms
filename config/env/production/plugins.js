// Override the default plugins configuration for production
module.exports = ({ env }) => ({
  email: {
    config: {
      provider: "amazon-ses",
      providerOptions: {
        key: env("AWS_ACCESS_KEY_ID"),
        secret: env("AWS_ACCESS_SECRET"),
        amazon: "https://email.us-east-1.amazonaws.com",
      },
      settings: {
        defaultFrom: "engineering+strapi-cms@farmgirlflowers.com",
        defaultReplyTo: "engineering+strapi-cms@farmgirlflowers.com",
      },
    },
  },
});
