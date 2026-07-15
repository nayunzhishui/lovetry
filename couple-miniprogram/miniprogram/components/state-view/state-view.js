Component({
  properties: {
    title: { type: String, value: "暂时没有内容" },
    description: { type: String, value: "" },
    actionText: { type: String, value: "" },
    loading: { type: Boolean, value: false }
  },
  methods: { onAction() { this.triggerEvent("action"); } }
});
