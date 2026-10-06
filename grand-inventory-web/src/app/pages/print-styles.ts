/**
 * The look of every printed sheet: black on white, A4, whatever theme the
 * screen is in. Shared so a delivery note and a delivery checklist read as
 * the same set of paperwork.
 */
export const PRINT_STYLES = `
        :host {
            display: block;
            min-height: 100vh;
            background: #e5e5e5;
            color: #111;
            font-family: 'Inter', system-ui, sans-serif;
        }
        .toolbar {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
            padding: 1rem;
        }
        .toolbar button {
            padding: 0.6rem 1.2rem;
            border-radius: 0.5rem;
            border: 1px solid #999;
            background: #fff;
            color: #111;
            font-weight: 600;
            cursor: pointer;
        }
        .toolbar button.primary {
            background: #111;
            color: #fff;
            border-color: #111;
        }
        .sheet {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto 2rem;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
            box-sizing: border-box;
            font-size: 10.5pt;
        }
        h1 {
            font-size: 18pt;
            margin: 0;
            letter-spacing: 0.02em;
        }
        .head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #111;
            padding-bottom: 6mm;
            margin-bottom: 5mm;
        }
        .muted {
            color: #555;
        }
        .docno {
            text-align: right;
        }
        .docno .no {
            font-size: 16pt;
            font-weight: 700;
            font-family: ui-monospace, monospace;
        }
        .facts {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 3mm 6mm;
            margin-bottom: 6mm;
        }
        .facts .k {
            font-size: 8pt;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #555;
        }
        .facts .v {
            font-weight: 600;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 6mm;
        }
        th,
        td {
            text-align: left;
            padding: 2mm 2mm;
            border-bottom: 1px solid #ccc;
            vertical-align: top;
        }
        th {
            font-size: 8pt;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #555;
            border-bottom: 1.5px solid #111;
        }
        td.num,
        th.num {
            text-align: right;
            white-space: nowrap;
        }
        .total {
            font-weight: 700;
        }
        h2 {
            font-size: 11pt;
            margin: 0 0 2mm;
        }
        .box {
            border: 1px solid #111;
            padding: 3mm 4mm;
            margin-bottom: 6mm;
        }
        .signs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10mm;
            margin-top: 14mm;
        }
        .sign .line {
            border-bottom: 1px solid #111;
            height: 12mm;
        }
        .sign .label {
            font-size: 8.5pt;
            color: #555;
            margin-top: 1.5mm;
        }
        .foot {
            margin-top: 8mm;
            font-size: 8pt;
            color: #777;
        }
        @media print {
            :host {
                background: #fff;
            }
            .toolbar {
                display: none;
            }
            .sheet {
                width: auto;
                min-height: 0;
                margin: 0;
                padding: 0;
                box-shadow: none;
            }
        }
        @page {
            size: A4;
            margin: 14mm;
        }
    .supplier {
        font-size: 13pt;
        font-weight: 700;
    }
`;
