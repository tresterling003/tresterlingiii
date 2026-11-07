import { O, SW, P } from "./palette";

const stroke = { stroke: O, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Desk body sits on the back-wall plane; the character always passes in front of it. */
export function Desk() {
  return (
    <g>
      <ellipse cx={1362} cy={694} rx={230} ry={16} fill="#2a1a10" opacity={0.2} />
      {/* Legs + drawer unit */}
      <rect x={1170} y={562} width={108} height={128} rx={4} fill={P.wood} {...stroke} />
      <rect x={1182} y={576} width={84} height={46} rx={4} fill={P.woodHi} stroke={O} strokeWidth={2} />
      <rect x={1182} y={630} width={84} height={46} rx={4} fill={P.woodHi} stroke={O} strokeWidth={2} />
      <rect x={1212} y={594} width={24} height={7} rx={3} fill={P.brass} stroke={O} strokeWidth={1.5} />
      <rect x={1212} y={648} width={24} height={7} rx={3} fill={P.brass} stroke={O} strokeWidth={1.5} />
      <rect x={1532} y={562} width={22} height={128} rx={3} fill={P.wood} {...stroke} />
      {/* Top */}
      <rect x={1156} y={544} width={412} height={22} rx={5} fill={P.woodHi} {...stroke} />
      <line x1={1162} y1={551} x2={1560} y2={551} stroke="#C48A5B" strokeWidth={3} />
      {/* Keyboard */}
      <path d="M1298 543 l8 -10 h120 l8 10 Z" fill="#EDE4D3" {...stroke} />
      <path d="M1312 538 h110" stroke={O} strokeWidth={1.5} strokeDasharray="5 3" />
      {/* Mug with gentle steam */}
      <rect x={1452} y={512} width={26} height={32} rx={5} fill={P.teal} {...stroke} />
      <path d="M1478 520 q12 0 12 10 q0 10 -12 10" fill="none" stroke={O} strokeWidth={SW} />

      {/* Notebook */}
      <path d="M1496 543 l6 -10 h44 l-4 10 Z" fill={P.tomato} {...stroke} />
    </g>
  );
}

export function DeskLamp({ on }: { on: number }) {
  return (
    <g>
      <ellipse cx={1528} cy={543} rx={22} ry={6} fill={P.metal} {...stroke} />
      <path d="M1528 538 L1512 470 L1548 426" fill="none" stroke={O} strokeWidth={9} strokeLinecap="round" />
      <path d="M1528 538 L1512 470 L1548 426" fill="none" stroke={P.honey} strokeWidth={4} strokeLinecap="round" />
      <circle cx={1512} cy={470} r={6} fill={P.metal} stroke={O} strokeWidth={2} />
      <g transform="rotate(28 1548 426)">
        <path d="M1528 416 h44 l14 34 h-72 Z" fill={P.honey} {...stroke} />
        <ellipse cx={1550} cy={452} rx={26} ry={6} fill={on > 0.15 ? "#FFF1C2" : "#E9D9A8"} stroke={O} strokeWidth={2} />
      </g>
    </g>
  );
}

export function Computer({ awake }: { awake: boolean }) {
  return (
    <g>
      <path d="M1350 520 l-8 22 h48 l-8 -22 Z" fill={P.metal} {...stroke} />
      <rect x={1272} y={378} width={190} height={144} rx={9} fill="#EDE4D3" {...stroke} />
      <rect x={1286} y={390} width={162} height={112} fill={awake ? "#24414A" : P.screen} stroke={O} strokeWidth={3} />
      {awake && (
        <g>
          <path d="M1287 470 q40 -22 82 -6 t78 -10 v47 h-160 Z" fill="#3E6B5E" />
          <rect x={1296} y={400} width={60} height={9} fill={P.glow} opacity={0.85} />
          <rect x={1296} y={415} width={93} height={6} fill={P.glow} opacity={0.5} />
          <rect x={1296} y={427} width={75} height={6} fill={P.glow} opacity={0.5} />
          {Array.from({ length: 18 }, (_, i) => (
            <rect key={i} x={1287} y={392 + i * 6} width={160} height={3} fill="#000" opacity={0.1} />
          ))}
        </g>
      )}
      {!awake && <path d="M1300 400 l24 0 l-24 24 Z" fill="#fff" opacity={0.08} />}
      <rect x={1437} y={509} width={6} height={6} fill={awake ? P.glow : "#7E8B84"} />
    </g>
  );
}

export function Phone({ lit }: { lit: boolean }) {
  return (
    <g>
      <path d="M1194 544 h52 l-6 -14 h-40 Z" fill={P.woodDark} {...stroke} />
      <rect x={1200} y={474} width={40} height={66} rx={6} fill="#3A3330" {...stroke} />
      <rect x={1206} y={481} width={28} height={50} fill={lit ? "#CFEFE2" : "#26302F"} />
      {lit && (
        <g>
          <rect x={1209} y={490} width={22} height={9} fill={P.paper} stroke={O} strokeWidth={2} />
          <rect x={1209} y={503} width={16} height={4} fill={P.teal} />
        </g>
      )}
    </g>
  );
}

/** Small round notification badge (the number is drawn as pixel text). */
export function Badge({ r }: { r: number }) {
  return <circle cx={0} cy={0} r={r} fill={P.tomato} stroke={O} strokeWidth={3} />;
}

/** Foreground desk chair (depth-sorted against the resident). */
export function Chair() {
  return (
    <g>
      <ellipse cx={1330} cy={822} rx={70} ry={12} fill="#2a1a10" opacity={0.22} />
      <path d="M1330 760 v52 M1290 818 l40 -10 l40 10" fill="none" stroke={O} strokeWidth={6} strokeLinecap="round" />
      <circle cx={1290} cy={820} r={6} fill={P.metal} stroke={O} strokeWidth={2} />
      <circle cx={1370} cy={820} r={6} fill={P.metal} stroke={O} strokeWidth={2} />
      <rect x={1270} y={736} width={120} height={28} rx={9} fill={P.honey} {...stroke} />
      <rect x={1280} y={640} width={100} height={100} rx={15} fill={P.honey} {...stroke} />
      <rect x={1294} y={656} width={72} height={66} rx={14} fill="#EDC56E" stroke={O} strokeWidth={2} />
    </g>
  );
}

export function FloorPlant() {
  return (
    <g>
      <ellipse cx={456} cy={742} rx={54} ry={10} fill="#2a1a10" opacity={0.22} />
      <g>
        {[
          "M456 690 C430 640 392 630 380 590 C420 596 446 620 456 690",
          "M456 690 C470 630 500 600 540 596 C530 640 490 660 456 690",
          "M456 690 C446 620 456 570 476 540 C490 590 476 640 456 690",
          "M456 690 C424 660 400 676 372 664 C392 640 430 650 456 690",
          "M456 690 C492 666 516 680 540 670 C522 648 486 654 456 690",
        ].map((d, i) => (
          <path key={i} d={d} fill={[P.leaf, P.leafLight, P.leafDark, P.leafLight, P.leaf][i]} stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
        ))}
      </g>
      <path d="M418 690 h76 l-10 52 h-56 Z" fill={P.pot} {...stroke} />
      <rect x={412} y={682} width={88} height={16} rx={5} fill={P.potDark} {...stroke} />
    </g>
  );
}

export function Cushion({ color }: { color: string }) {
  return (
    <g>
      <ellipse cx={900} cy={826} rx={96} ry={18} fill="#2a1a10" opacity={0.2} />
      <ellipse cx={900} cy={812} rx={92} ry={30} fill={color} {...stroke} />
      <ellipse cx={900} cy={806} rx={66} ry={16} fill="#ffffff" opacity={0.18} />
      <path d="M840 812 q60 18 120 0" fill="none" stroke={O} strokeWidth={2} opacity={0.4} />
    </g>
  );
}

export function Ball({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={18} rx={18} ry={5} fill="#2a1a10" opacity={0.2} />
      <circle r={17} fill={P.honey} {...stroke} />
      <path d="M-17 0 q17 -10 34 0 M0 -17 q-8 17 0 34" fill="none" stroke={P.tomato} strokeWidth={3} />
    </g>
  );
}
