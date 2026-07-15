Component({
  properties: {
    open: { type: Boolean, value: false },
    title: { type: String, value: "确认操作" },
    detail: { type: String, value: "" },
    confirmText: { type: String, value: "确认" }
  },
  methods: {
    cancel() { this.triggerEvent("cancel"); },
    confirm() { this.triggerEvent("confirm"); },
    stop() {}
  }
});
