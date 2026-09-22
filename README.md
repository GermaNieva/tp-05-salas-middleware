# Trabajo práctico 05

## Descripción

Aplicación web hecha con Node.js, Express y EJS para ver las reservas de las
salas de estudio de una biblioteca y pedir un turno nuevo.

El trabajo continúa lo de la semana anterior (páginas, formulario y archivos
estáticos), pero lo que se practica acá es el **middleware**: cada solicitud
pasa por una fila de funciones que la registran, le ponen un identificador, le
toman el tiempo, arman `req.body` y recién después llegan a la ruta.

Las salas permitidas son Sala Norte, Sala Sur y Sala Multimedia. Los turnos son
Mañana, Tarde y Noche. Las cuatro reservas iniciales y las que se cargan desde
el formulario viven solamente en memoria.

## Instalación

Hay que tener instalado Node.js. Después, desde la carpeta del proyecto:

```
npm install
```

Eso descarga Express, EJS, express-ejs-layouts y Morgan.

## Ejecución

```
npm start
```

El servidor queda escuchando en http://localhost:3000.

Para revisar que el archivo no tenga errores de sintaxis:

```
npm run check
```

## Rutas

| Método y ruta         | Qué hace                                                       |
| --------------------- | -------------------------------------------------------------- |
| `GET /`               | Página inicial con la explicación y los enlaces                |
| `GET /estado`         | Devuelve JSON con el servicio, la cantidad de reservas y el ID |
| `GET /reservas`       | Listado de reservas (o mensaje de listado vacío)               |
| `GET /reservas/nueva` | Formulario para reservar                                        |
| `GET /reservas/:id`   | Detalle de una reserva; si el id no existe responde 404        |
| `POST /reservas`      | Valida y, si está bien, crea la reserva y redirige             |

`GET /reservas/nueva` está declarada **antes** que `GET /reservas/:id`. Si
estuviera después, Express tomaría la palabra `nueva` como si fuera un id y el
formulario nunca se abriría.

`GET /estado` responde algo así:

```json
{
  "servicio": "activo",
  "reservas": 4,
  "solicitudId": "BIB-0001"
}
```

La cantidad cambia cuando se carga una reserva y el identificador sube en cada
solicitud.

## Pipeline de middleware

Este es el orden real que tiene `src/index.js`:

```
app.use(morgan("dev"));
app.use(identificarSolicitud);
app.use(medirDuracion);
app.use(expressLayouts);
app.use(express.static(...));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/");
app.get("/estado");

app.use("/reservas", reservasRouter);   // prepararAreaReservas + rutas internas

app.use(...)   // página 404, al final de todo
```

### Por qué ese orden

- **Morgan primero** para que quede registrada cualquier solicitud, incluso las
  que terminan en 404.
- **`identificarSolicitud` antes que `medirDuracion`**, porque la función que
  mide imprime el `solicitudId` y ese valor lo crea la anterior. Si estuvieran
  al revés, la línea de medición saldría con `undefined`.
- **`medirDuracion` bien arriba**, porque el tiempo tiene que empezar a contarse
  lo antes posible para que incluya todo lo que viene después.
- **`expressLayouts` antes de las rutas**, porque es el que hace que `res.render`
  meta la vista dentro de `layouts/main.ejs`.
- **`express.static` antes de las rutas**, así un pedido de `/css/estilos.css` se
  resuelve con el archivo y no sigue hasta el 404.
- **Los parsers antes del router**, porque `validarReserva` lee `req.body` y ese
  objeto lo arma `express.urlencoded`. Si el parser estuviera después,
  `req.body` llegaría vacío y toda reserva válida sería rechazada.
- **El 404 al final**, porque es el único que no tiene ruta: atrapa lo que no
  matcheó con nada anterior. Si estuviera arriba, respondería siempre él.

### Los tres tipos de middleware

- **Incorporado**: viene adentro de Express, no se instala aparte.
  Acá son `express.static`, `express.urlencoded` y `express.json`.
- **De terceros**: un paquete de npm que se instala y se enchufa.
  Acá es `morgan("dev")`, que imprime método, ruta, estado y tiempo.
- **Personalizado**: funciones escritas por mí con la forma
  `(req, res, next)`. Acá son `identificarSolicitud`, `medirDuracion`,
  `prepararAreaReservas` y `validarReserva`.

### Cuándo se usa `next()`

`next()` es la forma de decir "yo ya hice mi parte, que siga el siguiente".
Un middleware tiene que elegir una de dos cosas: **responder** (con `render`,
`json`, `redirect`) o **llamar a `next()`**. Las dos no, porque si ya se mandó
una respuesta y después se llama a `next()`, otra función puede intentar
responder de nuevo y aparece el error de cabeceras ya enviadas.

Por eso `validarReserva` llama a `next()` solamente en el camino válido, y en el
camino inválido hace `render` y corta con un `return`.

## Alcance de cada función

| Función               | Alcance   | Dónde corre                                     |
| --------------------- | --------- | ------------------------------------------------ |
| `morgan("dev")`       | global    | en todas las solicitudes                         |
| `identificarSolicitud`| global    | en todas las solicitudes                         |
| `medirDuracion`       | global    | en todas las solicitudes                         |
| `expressLayouts`      | global    | en todas las solicitudes                         |
| `express.static`      | global    | en todas las solicitudes                         |
| `express.urlencoded`  | global    | en todas las solicitudes                         |
| `express.json`        | global    | en todas las solicitudes                         |
| `prepararAreaReservas`| de router | solo en lo que cuelga de `/reservas`             |
| `validarReserva`      | de ruta   | solo en `POST /reservas`                         |

- **Global** (`app.use(...)`): corre para cualquier dirección.
- **De router** (`reservasRouter.use(...)`): corre solo para las direcciones que
  entran por el montaje `app.use("/reservas", reservasRouter)`.
- **De ruta** (`reservasRouter.post("/", validarReserva, crearReserva)`): corre
  solo para ese método y esa dirección.

`prepararAreaReservas` deja `res.locals.seccion = "Reservas de salas"`, que las
vistas `reservas/lista.ejs` y `reservas/nueva.ejs` muestran arriba del título.
`GET /estado` no pasa por el router, así que no tiene ese valor y tampoco lo
necesita: devuelve JSON.

### Qué logra montar el router

```js
app.use("/reservas", reservasRouter);
```

El montaje hace que las rutas de adentro del router sean **relativas**: `/`,
`/nueva` y `/:id` terminan siendo `/reservas`, `/reservas/nueva` y
`/reservas/:id`. Por eso adentro del router no hay que volver a escribir
`/reservas`. Además permite agrupar todo lo de esa sección y engancharle
middleware propio.

### El identificador de solicitud

`identificarSolicitud` tiene un contador que arranca en 0 y sube de a uno.
Con `padStart(4, "0")` arma `BIB-0001`, `BIB-0002`, `BIB-0003`, y lo guarda en
`res.locals.solicitudId`. Todo lo que se pone en `res.locals` queda disponible
en las vistas sin pasarlo por `res.render`, así que el layout lo muestra en el
pie de todas las páginas y `GET /estado` lo devuelve en el JSON.

### Por qué la medición usa el evento `finish`

`medirDuracion` guarda `Date.now()` al principio, pero el cálculo no se puede
hacer ahí: en ese momento la respuesta todavía no se armó. Por eso registra un
listener:

```js
res.on("finish", function () { ... });
```

`finish` es el evento que Express/Node disparan cuando la respuesta ya terminó
de enviarse. Recién ahí se conoce el tiempo real y el `res.statusCode`
definitivo. El middleware, mientras tanto, llama a `next()` enseguida para no
frenar la solicitud.

En la terminal quedan dos líneas por solicitud, la de Morgan y la mía:

```
GET /reservas 200 1.679 ms - 2909
BIB-0004 GET /reservas -> 200 (2 ms)
```

## Validación

`validarReserva` hace, en este orden:

1. le saca los espacios de más a los textos con `trim()`;
2. convierte `personas` con `Number`;
3. revisa que no falte ningún campo;
4. revisa que la sala esté en `salasPermitidas`;
5. revisa que el turno esté en `turnosPermitidos`;
6. revisa que `personas` sea un entero del 1 al 6;
7. revisa de manera básica que el email tenga una arroba;
8. si algo falla responde **400**, vuelve a mostrar el formulario con los
   valores que se habían escrito y un mensaje con `role="alert"`;
9. si está todo bien arma `req.reservaValidada` y llama a `next()`.

El formulario también tiene `type="date"`, `min` y `max`, pero eso es ayuda del
navegador y se puede saltear. Las comprobaciones del servidor son las que
mandan.

`crearReserva` no vuelve a validar: confía en `req.reservaValidada`, le pone un
id nuevo (el más alto + 1), lo agrega al arreglo y redirige.

### Diagrama del POST válido

```
POST /reservas
  ↓ morgan("dev")
  ↓ identificarSolicitud
  ↓ medirDuracion
  ↓ expressLayouts
  ↓ express.urlencoded
  ↓ reservasRouter
  ↓ prepararAreaReservas
  ↓ validarReserva
  ↓ crearReserva
  ↓ 302 /reservas
  ↓ finish: ID + estado + duración
```

### Diagrama del POST inválido

```
POST /reservas
  ↓ morgan("dev")
  ↓ identificarSolicitud
  ↓ medirDuracion
  ↓ expressLayouts
  ↓ express.urlencoded
  ↓ reservasRouter
  ↓ prepararAreaReservas
  ↓ validarReserva  ->  400 + render de reservas/nueva  ->  FIN
  ↓ finish: ID + estado 400 + duración
```

El camino inválido **termina en `validarReserva`**. Nunca llega a
`crearReserva`, así que no se agrega ninguna reserva al arreglo. La respuesta
igual pasa por `finish`, porque la medición se engancha al final de cualquier
respuesta, salga bien o mal.

### Diferencia entre el POST 302 y el GET posterior

El POST no dibuja el listado: responde `res.redirect("/reservas")`, que es un
**302**, o sea "la información que buscás está en esta otra dirección". Al
recibirlo, el navegador hace por su cuenta un `GET /reservas` y ese segundo
pedido es el que devuelve **200** con la página ya actualizada.

Son dos solicitudes distintas, y se ve en la terminal porque cada una tiene su
propio `BIB-xxxx`. Se hace así para que la dirección que queda en el navegador
sea un GET: si quedara el POST, al apretar F5 el navegador ofrecería reenviar el
formulario y se cargaría la reserva dos veces.

## Pruebas manuales

| Caso                              | Estado esperado   | Resultado              |
| --------------------------------- | ----------------- | ---------------------- |
| `GET /`                           | 200               | OK                     |
| `GET /estado`                     | 200               | JSON con cantidad e ID |
| `GET /reservas`                   | 200               | 4 reservas             |
| Listado vacío (arreglo vacío)     | 200               | mensaje alternativo    |
| `GET /reservas/nueva`             | 200               | controles etiquetados  |
| `GET /reservas/1`                 | 200               | datos completos        |
| `GET /reservas/999`               | 404               | página HTML            |
| Campos vacíos                     | 400               | error y valores        |
| Sala no permitida                 | 400               | no se crea             |
| Turno no permitido                | 400               | no se crea             |
| Email sin arroba                  | 400               | no se crea             |
| `personas = 0`                    | 400               | no se crea             |
| `personas = 7`                    | 400               | no se crea             |
| Reserva válida                    | 302 y después 200 | tarjeta nueva          |
| `GET /direccion-inventada`        | 404               | middleware final       |
| Reinicio del servidor             | 200               | vuelve a 4 reservas    |

En cada caso miré también la línea de Morgan y la línea de medición en la
terminal. Para probar el listado vacío le pasé por un rato un arreglo vacío a la
vista y después dejé el código como estaba.

## Persistencia temporal

Las reservas están en una constante de `src/index.js`:

```js
const reservas = [ ... ];
```

`crearReserva` hace `reservas.push(nueva)` y nada más: no escribe en ningún
archivo ni en ninguna base de datos. Ese arreglo vive en la memoria del proceso
de Node.

Cuando se corta el servidor con Ctrl + C, el proceso termina y esa memoria se
libera. Al volver a ejecutar `npm start`, Node lee el archivo otra vez y arma el
arreglo con las cuatro reservas escritas en el código, así que las que se habían
cargado desde el formulario desaparecen. El contador de `identificarSolicitud`
también vuelve a empezar en `BIB-0001`.
