export function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        const data = [
            navigator.userAgent,
            screen.width,
            screen.height,
            navigator.language,
            new Date().getTimezoneOffset()
        ].join('||');
        deviceId = btoa(data).slice(0, 20);
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}