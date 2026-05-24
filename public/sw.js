self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('message', async event => {
  const { type } = event.data || {}

  if (type === 'SHOW_TRACKING') {
    try {
      await self.registration.showNotification('🛵 Danzo Entregador', {
        body: 'Rastreamento ativo — mantenha o app aberto',
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: 'gps-tracking',
        renotify: false,
        silent: true,
      })
    } catch {}
  }

  if (type === 'HIDE_TRACKING') {
    try {
      const notifs = await self.registration.getNotifications({ tag: 'gps-tracking' })
      notifs.forEach(n => n.close())
    } catch {}
  }
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return clients.openWindow('/')
    })
  )
})
