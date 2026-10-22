Modaler Dialog – Bestätigung vor jeder Umplanung.

```jsx
<Dialog open={open} onClose={close} title="Buchung verschieben?" description="B-1042 auf Do 15.10. 15:00, Rampe 9." footer={<><Button variant="ghost" onClick={close}>Abbrechen</Button><Button onClick={confirm}>Verschieben</Button></>} />
```
