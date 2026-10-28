/* =========================================================================
   ENCICLOPEDIA ECO LOCAL (funciona sin conexión). Jugadas en SAN inglés;
   se muestran en la notación elegida. Detección por POSICIÓN, así que
   reconoce transposiciones.
   ========================================================================= */
const ECO_BOOK = [
  ["A00", "Apertura Polaca (Sokolsky)", "1. b4"],
  ["A00", "Ataque Grob", "1. g4"],
  ["A01", "Apertura Larsen", "1. b3"],
  ["A02", "Apertura Bird", "1. f4"],
  ["A04", "Apertura Réti", "1. Nf3"],
  ["A05", "Réti · 1...Cf6", "1. Nf3 Nf6"],
  ["A06", "Réti · 1...d5", "1. Nf3 d5"],
  ["A07", "Ataque Indio de Rey", "1. Nf3 d5 2. g3"],
  ["A09", "Réti · Sistema con c4", "1. Nf3 d5 2. c4"],
  ["A10", "Apertura Inglesa", "1. c4"],
  ["A13", "Inglesa · 1...e6", "1. c4 e6"],
  ["A15", "Inglesa · Anglo-India", "1. c4 Nf6"],
  ["A16", "Inglesa · Anglo-India 2.Cc3", "1. c4 Nf6 2. Nc3"],
  ["A20", "Inglesa · Siciliana Invertida", "1. c4 e5"],
  ["A22", "Inglesa · Dos Caballos", "1. c4 e5 2. Nc3 Nf6"],
  ["A25", "Inglesa · 2...Cc6", "1. c4 e5 2. Nc3 Nc6"],
  ["A30", "Inglesa Simétrica", "1. c4 c5"],
  ["A40", "Apertura de Peón de Dama", "1. d4"],
  ["A41", "Peón de Dama · 1...d6", "1. d4 d6"],
  ["A43", "Benoni Antigua", "1. d4 c5"],
  ["A45", "Defensa India", "1. d4 Nf6"],
  ["A45", "Ataque Trompowsky", "1. d4 Nf6 2. Bg5"],
  ["A46", "Peón de Dama · 2.Cf3", "1. d4 Nf6 2. Nf3"],
  ["A46", "Ataque Torre", "1. d4 Nf6 2. Nf3 e6 3. Bg5"],
  ["A48", "India de Rey · Sistema con Cf3", "1. d4 Nf6 2. Nf3 g6"],
  ["A51", "Gambito Budapest", "1. d4 Nf6 2. c4 e5"],
  ["A56", "Defensa Benoni", "1. d4 Nf6 2. c4 c5"],
  ["A57", "Gambito Benko (Volga)", "1. d4 Nf6 2. c4 c5 3. d5 b5"],
  ["A60", "Benoni Moderna", "1. d4 Nf6 2. c4 c5 3. d5 e6"],
  ["A80", "Defensa Holandesa", "1. d4 f5"],
  ["A81", "Holandesa · 2.g3", "1. d4 f5 2. g3"],
  ["A86", "Holandesa · Leningrado", "1. d4 f5 2. c4 Nf6 3. g3 g6"],
  ["A90", "Holandesa · Muro de Piedra (Stonewall)", "1. d4 f5 2. c4 Nf6 3. g3 e6 4. Bg2 d5"],
  ["B00", "Defensa Nimzowitsch", "1. e4 Nc6"],
  ["B00", "Defensa Owen", "1. e4 b6"],
  ["B00", "Apertura de Peón de Rey", "1. e4"],
  ["B01", "Defensa Escandinava", "1. e4 d5"],
  ["B01", "Escandinava · 2...Dxd5", "1. e4 d5 2. exd5 Qxd5"],
  ["B01", "Escandinava · 3...Da5", "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5"],
  ["B02", "Defensa Alekhine", "1. e4 Nf6"],
  ["B03", "Alekhine · 3.d4", "1. e4 Nf6 2. e5 Nd5 3. d4"],
  ["B06", "Defensa Moderna", "1. e4 g6"],
  ["B07", "Defensa Pirc", "1. e4 d6 2. d4 Nf6"],
  ["B07", "Pirc · 3.Cc3 g6", "1. e4 d6 2. d4 Nf6 3. Nc3 g6"],
  ["B09", "Pirc · Ataque Austriaco", "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. f4"],
  ["B10", "Defensa Caro-Kann", "1. e4 c6"],
  ["B12", "Caro-Kann · Variante del Avance", "1. e4 c6 2. d4 d5 3. e5"],
  ["B13", "Caro-Kann · Variante del Cambio", "1. e4 c6 2. d4 d5 3. exd5 cxd5"],
  ["B13", "Caro-Kann · Ataque Panov-Botvinnik", "1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4"],
  ["B15", "Caro-Kann · 3.Cc3", "1. e4 c6 2. d4 d5 3. Nc3"],
  ["B17", "Caro-Kann · Variante Karpov", "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7"],
  ["B18", "Caro-Kann · Variante Clásica", "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5"],
  ["B20", "Defensa Siciliana", "1. e4 c5"],
  ["B21", "Siciliana · Gambito Smith-Morra", "1. e4 c5 2. d4 cxd4 3. c3"],
  ["B22", "Siciliana · Variante Alapin", "1. e4 c5 2. c3"],
  ["B23", "Siciliana Cerrada", "1. e4 c5 2. Nc3"],
  ["B27", "Siciliana · 2.Cf3", "1. e4 c5 2. Nf3"],
  ["B30", "Siciliana · 2...Cc6", "1. e4 c5 2. Nf3 Nc6"],
  ["B30", "Siciliana · Variante Rossolimo", "1. e4 c5 2. Nf3 Nc6 3. Bb5"],
  ["B32", "Siciliana Abierta · 2...Cc6", "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4"],
  ["B33", "Siciliana · Variante Sveshnikov", "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5"],
  ["B34", "Siciliana · Dragón Acelerado", "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6"],
  ["B40", "Siciliana · 2...e6", "1. e4 c5 2. Nf3 e6"],
  ["B41", "Siciliana · Variante Kan (Paulsen)", "1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 a6"],
  ["B44", "Siciliana · Variante Taimanov", "1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nc6"],
  ["B50", "Siciliana · 2...d6", "1. e4 c5 2. Nf3 d6"],
  ["B51", "Siciliana · Ataque Moscú", "1. e4 c5 2. Nf3 d6 3. Bb5+"],
  ["B54", "Siciliana Abierta · 2...d6", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4"],
  ["B56", "Siciliana · 5.Cc3", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3"],
  ["B56", "Siciliana · Variante Clásica", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Nc6"],
  ["B60", "Siciliana · Ataque Richter-Rauzer", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Nc6 6. Bg5"],
  ["B70", "Siciliana · Variante del Dragón", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6"],
  ["B75", "Dragón · Ataque Yugoslavo", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3"],
  ["B80", "Siciliana · Variante Scheveningen", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e6"],
  ["B90", "Siciliana · Variante Najdorf", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6"],
  ["B90", "Najdorf · Ataque Inglés", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3"],
  ["B92", "Najdorf · 6.Ae2", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2"],
  ["B94", "Najdorf · 6.Ag5", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5"],
  ["C00", "Defensa Francesa", "1. e4 e6"],
  ["C00", "Francesa · 2...d5", "1. e4 e6 2. d4 d5"],
  ["C01", "Francesa · Variante del Cambio", "1. e4 e6 2. d4 d5 3. exd5 exd5"],
  ["C02", "Francesa · Variante del Avance", "1. e4 e6 2. d4 d5 3. e5"],
  ["C03", "Francesa · Variante Tarrasch", "1. e4 e6 2. d4 d5 3. Nd2"],
  ["C10", "Francesa · 3.Cc3", "1. e4 e6 2. d4 d5 3. Nc3"],
  ["C10", "Francesa · Variante Rubinstein", "1. e4 e6 2. d4 d5 3. Nc3 dxe4"],
  ["C11", "Francesa · Variante Clásica", "1. e4 e6 2. d4 d5 3. Nc3 Nf6"],
  ["C15", "Francesa · Variante Winawer", "1. e4 e6 2. d4 d5 3. Nc3 Bb4"],
  ["C18", "Winawer · Línea principal", "1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3"],
  ["C20", "Apertura Abierta (Doble Peón de Rey)", "1. e4 e5"],
  ["C21", "Gambito Danés", "1. e4 e5 2. d4 exd4 3. c3"],
  ["C22", "Apertura del Centro", "1. e4 e5 2. d4 exd4 3. Qxd4"],
  ["C23", "Apertura de Alfil", "1. e4 e5 2. Bc4"],
  ["C25", "Apertura Vienesa", "1. e4 e5 2. Nc3"],
  ["C30", "Gambito de Rey", "1. e4 e5 2. f4"],
  ["C33", "Gambito de Rey Aceptado", "1. e4 e5 2. f4 exf4"],
  ["C40", "Apertura de Caballo de Rey", "1. e4 e5 2. Nf3"],
  ["C40", "Gambito Letón", "1. e4 e5 2. Nf3 f5"],
  ["C41", "Defensa Philidor", "1. e4 e5 2. Nf3 d6"],
  ["C42", "Defensa Petrov (Rusa)", "1. e4 e5 2. Nf3 Nf6"],
  ["C44", "Apertura de Caballo de Rey · 2...Cc6", "1. e4 e5 2. Nf3 Nc6"],
  ["C44", "Apertura Ponziani", "1. e4 e5 2. Nf3 Nc6 3. c3"],
  ["C44", "Gambito Escocés", "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4"],
  ["C45", "Apertura Escocesa", "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4"],
  ["C46", "Apertura de los Tres Caballos", "1. e4 e5 2. Nf3 Nc6 3. Nc3"],
  ["C47", "Apertura de los Cuatro Caballos", "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6"],
  ["C48", "Cuatro Caballos · Variante Española", "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bb5"],
  ["C50", "Apertura Italiana", "1. e4 e5 2. Nf3 Nc6 3. Bc4"],
  ["C50", "Giuoco Piano", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5"],
  ["C50", "Giuoco Pianissimo", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3"],
  ["C51", "Gambito Evans", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4"],
  ["C53", "Giuoco Piano · 4.c3", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3"],
  ["C55", "Defensa de los Dos Caballos", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6"],
  ["C57", "Dos Caballos · 4.Cg5", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5"],
  ["C57", "Dos Caballos · Ataque Fegatello", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7"],
  ["C60", "Apertura Española (Ruy López)", "1. e4 e5 2. Nf3 Nc6 3. Bb5"],
  ["C65", "Española · Defensa Berlinesa", "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6"],
  ["C67", "Berlinesa · Muro de Berlín", "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4"],
  ["C68", "Española · Variante del Cambio", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6"],
  ["C70", "Española · Defensa Morphy", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4"],
  ["C78", "Española · 5.O-O", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O"],
  ["C80", "Española Abierta", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4"],
  ["C84", "Española Cerrada", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7"],
  ["C88", "Española Cerrada · 7.Ab3", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3"],
  ["C89", "Española · Ataque Marshall", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. c3 d5"],
  ["C90", "Española Cerrada · 8...d6", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O"],
  ["C92", "Española Cerrada · 9.h3", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3"],
  ["D00", "Apertura de Peón de Dama · 1...d5", "1. d4 d5"],
  ["D00", "Sistema Londres", "1. d4 d5 2. Bf4"],
  ["D01", "Ataque Veresov", "1. d4 d5 2. Nc3 Nf6 3. Bg5"],
  ["D02", "Sistema Londres · 2.Cf3", "1. d4 d5 2. Nf3 Nf6 3. Bf4"],
  ["D05", "Sistema Colle", "1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3"],
  ["D06", "Gambito de Dama", "1. d4 d5 2. c4"],
  ["D07", "Defensa Chigorin", "1. d4 d5 2. c4 Nc6"],
  ["D08", "Contragambito Albin", "1. d4 d5 2. c4 e5"],
  ["D10", "Defensa Eslava", "1. d4 d5 2. c4 c6"],
  ["D15", "Eslava · 4.Cc3", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3"],
  ["D17", "Eslava Aceptada · 5...Af5", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5"],
  ["D20", "Gambito de Dama Aceptado", "1. d4 d5 2. c4 dxc4"],
  ["D30", "Gambito de Dama Rehusado", "1. d4 d5 2. c4 e6"],
  ["D31", "Gambito de Dama Rehusado · 3.Cc3", "1. d4 d5 2. c4 e6 3. Nc3"],
  ["D32", "Defensa Tarrasch", "1. d4 d5 2. c4 e6 3. Nc3 c5"],
  ["D35", "Gambito de Dama Rehusado · 3...Cf6", "1. d4 d5 2. c4 e6 3. Nc3 Nf6"],
  ["D35", "Gambito de Dama Rehusado · Cambio", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5"],
  ["D37", "Gambito de Dama Rehusado · 4.Cf3", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3"],
  ["D43", "Defensa Semieslava", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6"],
  ["D44", "Semieslava · Variante Botvinnik", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. Bg5 dxc4"],
  ["D45", "Semieslava · 5.e3", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3"],
  ["D46", "Semieslava · 6.Ad3", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7 6. Bd3"],
  ["D47", "Semieslava · Variante Merano", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7 6. Bd3 dxc4 7. Bxc4 b5"],
  ["D53", "Gambito de Dama Rehusado · 4.Ag5 Ae7", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7"],
  ["D80", "Defensa Grünfeld", "1. d4 Nf6 2. c4 g6 3. Nc3 d5"],
  ["D85", "Grünfeld · Variante del Cambio", "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3"],
  ["E00", "Defensa India de Dama/Catalana · 2...e6", "1. d4 Nf6 2. c4 e6"],
  ["E01", "Apertura Catalana", "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2"],
  ["E10", "Peón de Dama · 3.Cf3", "1. d4 Nf6 2. c4 e6 3. Nf3"],
  ["E11", "Defensa Bogo-India", "1. d4 Nf6 2. c4 e6 3. Nf3 Bb4+"],
  ["E12", "Defensa India de Dama", "1. d4 Nf6 2. c4 e6 3. Nf3 b6"],
  ["E20", "Defensa Nimzo-India", "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4"],
  ["E21", "Nimzo-India · 4.Cf3", "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Nf3"],
  ["E24", "Nimzo-India · Variante Sämisch", "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. a3"],
  ["E32", "Nimzo-India · Variante Clásica", "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2"],
  ["E40", "Nimzo-India · Variante Rubinstein", "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3"],
  ["E60", "Defensa India de Rey", "1. d4 Nf6 2. c4 g6"],
  ["E61", "India de Rey · 3.Cc3 Ag7", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7"],
  ["E62", "India de Rey · Variante del Fianchetto", "1. d4 Nf6 2. c4 g6 3. Nf3 Bg7 4. g3 O-O 5. Bg2 d6 6. O-O"],
  ["E70", "India de Rey · 4.e4", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6"],
  ["E76", "India de Rey · Ataque de los Cuatro Peones", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4"],
  ["E80", "India de Rey · Variante Sämisch", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3"],
  ["E90", "India de Rey · Variante Clásica", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3"],
  ["E97", "India de Rey · Mar del Plata", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6"]
].map(([eco, name, moves]) => ({ eco, name, moves }));

const CLASSIC_ENDGAMES = [
  { name: "Posición de Lucena", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", note: "Torre y peón contra torre: gana construyendo «el puente» (la torre a la 4ª fila para cortar los jaques laterales). Rd1+ y Tc4 ganan." },
  { name: "Defensa Philidor", fen: "2R5/4k3/r7/4PK2/8/8/8/8 b - - 0 1", note: "Tablas: la torre negra vigila la 6ª fila (Ta6) para que el rey blanco no avance; cuando el peón llegue a e6, a dar jaques desde atrás." },
  { name: "Estudio de Saavedra", fen: "8/8/1KP5/3r4/8/8/8/k7 w - - 0 1", note: "Sólo 1.c7 gana. Tras 1...Td6+ 2.Rb5 Td5+ 3.Rb4 Td4+ 4.Rb3 Td3+ 5.Rc2 Td4! la clave es 6.c8=T!! (coronar dama permite el ahogado)." },
  { name: "Oposición: rey y peón", fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", note: "Con el rey en la 6ª fila delante del peón, gana juegue quien juegue: casillas clave." },
  { name: "Regla del cuadrado", fen: "8/8/8/8/p7/8/8/4K2k w - - 0 1", note: "¿Alcanza el rey al peón? Sólo Rd1 o Rd2 entran en el cuadrado del peón y hacen tablas." },
  { name: "Mate con dama", fen: "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", note: "Reduce el espacio del rey con la dama (a salto de caballo) y acerca tu rey. ¡Cuidado con el ahogado!" },
  { name: "Mate con torre", fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1", note: "Usa la oposición de reyes y la torre para empujar al rey rival fila a fila hasta el borde." },
  { name: "Mate de alfil y caballo", fen: "8/8/8/4k3/8/8/8/2B1KN2 w - - 0 1", note: "El mate sólo es posible en la esquina del color del alfil (a1/h8 aquí). Máximo 33 jugadas con técnica perfecta." }
];

const SAMPLE_MULTI_PGN = `[Event "Partida de la Ópera"]
[Site "París"]
[Date "1858.??.??"]
[Round "-"]
[White "Morphy, Paul"]
[Black "Duque de Brunswick y Conde Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0

[Event "La Siempreviva"]
[Site "Berlín"]
[Date "1852.??.??"]
[Round "-"]
[White "Anderssen, Adolf"]
[Black "Dufresne, Jean"]
[Result "1-0"]
[ECO "C52"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3
Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7
15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7
21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0

[Event "La Inmortal"]
[Site "Londres"]
[Date "1851.06.21"]
[Round "-"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]
[ECO "C33"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4
Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4
Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8
22. Qf6+ Nxf6 23. Be7# 1-0

[Event "Hoogovens"]
[Site "Wijk aan Zee"]
[Date "1999.01.20"]
[Round "4"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[Result "1-0"]
[WhiteElo "2812"]
[BlackElo "2700"]
[ECO "B07"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6
Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4
15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1
d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+
Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+
Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8
Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0

[Event "Partida del Siglo"]
[Site "Nueva York"]
[Date "1956.10.17"]
[Round "8"]
[White "Byrne, Donald"]
[Black "Fischer, Robert James"]
[Result "0-1"]
[ECO "D92"]

1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4
Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6
15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+
21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2
27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4
h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+
40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1

[Event "Campeonato del Mundo"]
[Site "Moscú"]
[Date "1985.10.15"]
[Round "16"]
[White "Karpov, Anatoly"]
[Black "Kasparov, Garry"]
[Result "0-1"]
[ECO "B44"]

1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nc6 5. Nb5 d6 6. c4 Nf6 7. N1c3 a6 8. Na3
d5 9. cxd5 exd5 10. exd5 Nb4 11. Be2 Bc5 12. O-O O-O 13. Bf3 Bf5 14. Bg5 Re8
15. Qd2 b5 16. Rad1 Nd3 17. Nab1 h6 18. Bh4 b4 19. Na4 Bd6 20. Bg3 Rc8 21. b3 g5
22. Bxd6 Qxd6 23. g3 Nd7 24. Bg2 Qf6 25. a3 a5 26. axb4 axb4 27. Qa2 Bg6 28. d6
g4 29. Qd2 Kg7 30. f3 Qxd6 31. fxg4 Qd4+ 32. Kh1 Nf6 33. Rf4 Ne4 34. Qxd3 Nf2+
35. Rxf2 Bxd3 36. Rfd2 Qe3 37. Rxd3 Rc1 38. Nb2 Qf2 39. Nd2 Rxd1+ 40. Nxd1 Re1+
0-1`;
