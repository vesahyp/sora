# Sora

Soraa, mutkia ja kello. Ylhäältä kuvattu ralli puhelimeen: yksi peukalo
ohjaa, kaasu on pohjassa, ja kello käy.

**Pelaa: https://vesahyp.github.io/sora/**. Toimii puhelimessa ja
selaimessa. Lisää kotinäytölle (iPhone: Jaa, Lisää Koti-valikkoon;
Chrome: osoiterivin asennuskuvake), niin se aukeaa koko ruudulle omalla
kuvakkeellaan ja toimii ilman verkkoa.

Peli on suomeksi ja englanniksi, kielen valitsee selain. *In English: the
game follows your browser's language.*

## Miten pelataan

**Puhelimella:** kaasu on aina pohjassa. Paina peukalo ruudulle mihin
tahansa ja vedä sivulle: auto kääntyy sen verran kuin peukalo on siirtynyt.
Pieni liike on pieni korjaus, täysi käännös vaatii kunnon vedon.
Nosta peukalo, niin ratti suoristuu. Napautus sytyttää **nitron**.
Vasemmassa alakulmassa on **poljin**, ja toinen sormi missä tahansa on
sama poljin: se jarruttaa ja irrottaa perän, eli jarrutus mutkaan heittää
auton sivuluisuun. Pysähdyksissä pohjaan painettuna auto peruuttaa.

**Aseet laukeavat itse.** Konekivääri ampuu, kun auto on edessä
tähtäimen kartiossa, ja kuumenee parin sekunnin sarjasta. Ohjus lähtee,
kun auto on pysynyt tähtäimessä puoli sekuntia. Miina putoaa, kun auto on
ihan takana. Sinä päätät, mihin ajat ja milloin nitro palaa.

**Näppäimistöllä:** nuolet tai A ja D kääntävät, alas, S tai välilyönti
on poljin, X tai ylös on nitro.

## Kisa

Kolme kierrosta, neljä autoa, ja kaikki yrittävät romuttaa toisensa.
**Lähdet viimeisenä**: kisa on nousu kentän läpi. Jorma ajaa kovaa ja
kylmästi, Marko on tappelija, Tapsa on arka kuski jonka ohitat ensin.
Kaikki nojaavat viereiseen autoon. Kenttä pysyy lähelläsi: edellä ajava
hiljentää ja takana tuleva painaa.

**Kenttä kantaa kaunaa.** Kun töytäiset, ammut tai romutat jonkun, hän
muistaa sen: nojaa sinuun kovemmin, työntää perästä, ampuu sinua ensin
ja tukkii linjasi, kun tulet takaa. Edellä ajava kaunainen kuski jopa
hiljentää, jotta pääsee kostamaan. Marko muistaa kaiken, Tapsa unohtaa
pian, ja kauna haihtuu noin kierroksessa.

**Johtaja saa osumat.** Kaikki ampuvat ja tönivät ensin sitä, joka ajaa
kärjessä, ja sinun edelläsi ajavat tukkivat linjan. Kärkeen kannattaa
mennä vasta, kun sen jaksaa pitää.

Tie on kapea, kolmen auton levyinen. Ohi pääsee, mutta ei ilman
kylkiä.

**Auto painaa.** Perä lähtee luisuun pehmeästi ja pitää, ja kun peukalo
nousee, auto oikaisee itsensä. Poljin mutkassa heittää perän ympäri
hiusneulaa varten. Puurivi ei pysäytä: viistossa osumassa auto liukuu
puiden vartta ja jatkaa. Autot tönivät toisiaan oikeasti: osuma toisen
takakulmaan pyöräyttää sen, ja painavampi auto siirtää kevyempää.
Vanhan ajomallin voi vielä yhden version ajan kokeilla osoitteessa
https://vesahyp.github.io/sora/?physics=old.

- **Sivuluisu** täyttää nitrotankkia. Niin täyttää myös töytäisy ja
  erityisesti toisen auton romuttaminen, joka täyttää tankin kerralla.
- **Törmäys** sattuu siihen, johon osutaan. Painavampi ja panssaroitu
  auto voittaa. Kova töytäisy pyöräyttää.
- **Vauriot** hidastavat autoa. Sadassa auto on **romu**: se palaa
  hetken ja palaa sitten tielle puolikuntoisena.
- **Romuttaminen maksaa.** Romuttaja saa palkkion heti, ja töytäisy,
  joka pyöräyttää toisen, tuo pienen summan. Tappelu maksaa enemmän
  kuin tieltä kerätty raha.
- **Tiellä on tavaraa:** rahaa, nitroa, korjausta, ohjuksia ja miinoja.
  Ne ovat tien laidoilla, eivät ajolinjalla: haku maksaa linjan. Rahaa
  on vähän, ja se on aivan reunassa. Otettu kasvaa takaisin hetken päästä.
- Nurmi on liukas, metsä pysäyttää. Maalissa korjaus maksaa osan
  palkinnosta.

Kaksi rataa: **Kiviaho**, reilu puoli kilometriä ja alle puoli minuuttia
kierros, ja **Hirvisuo**, kilometrin lenkki.

## Ura

Ura alkaa tallista: Kortteli 1.3 ja 600 krediittiä. Kisat tuovat rahaa
sijoituksen mukaan, ja raha menee kolmeen paikkaan:

- **Osakauppa**: renkaat, kevennys, moottori, jarrut, panssari ja
  konekivääri, kolme tasoa kukin. Renkaat ensin, se on paras raha.
  Panssari kestää osumia ja painaa kolarissa.
- **Autokauppa**: kolme autoa, luokat C, B ja A. Vanha auto jää talliin.
  Täyteen rakennettu auto on lähes seuraavan luokan vakioauton veroinen.
- **Asevarasto**: ohjuksia ja miinoja kappaleittain. Mitä jää, se jää
  seuraavaan kisaan. Ura alkaa kolmella kummallakin.
- **Ajokortit**: B- ja A-luokan kisoihin pitää ajaa kortti: yksi kierros
  yksin omalla autolla alle rajan. Kello käy lähtövaloista.

Kisat on jaettu luokkiin. Kentän autot ovat luokan autoja, ja saman luokan
myöhemmät kisat ajetaan rakennetummilla autoilla. Luokan C kisoihin ei
pääse B-autolla: se olisi liian helppoa.

Suunnitelma on [`docs/design.md`](docs/design.md), seuraavat askeleet
[`ROADMAP.md`](ROADMAP.md).
