Data Table der Disposition: dicht, Tabellenziffern, sortierbar, Zeile klickbar.

```jsx
<Table columns={[{key:"id",label:"Buchung",mono:true},{key:"status",label:"Status",render:(r)=><StatusBadge status={r.status} size="sm" />}]} rows={rows} onRowClick={open} />
```
