# **Sistema de Procesamiento de Órdenes (Microservicios)**
## __Introducción__
Este proyecto implementa una arquitectura de microservicios para el procesamiento de órdenes de compra. Utiliza un Lambda Orquestador para coordinar las transacciones entre los servicios dependientes (Orders API, Customers API), garantizando la integridad transaccional a través del patrón de Compensación (Saga Pattern) y la resiliencia mediante la Idempotencia.


### __Tecnologías__
* __Arquitectura:__ Microservicios, Saga Pattern (Orquestación).

* __Servicios:__ Node.js (Express), MySQL.

* __Contenedorización:__ Docker, Docker Compose.

* __Cloud (Simulado):__ AWS Lambda / API Gateway (vía serverless offline).

## __Setup Rápido__
Sigue estos pasos para levantar el entorno de microservicios en tu máquina local.
__Prerrequisitos__

Asegúrate de tener instalados los siguientes programas.

- Docker y Docker Compose
- Node.js v18+ y npm

__Instrucciones de ejecución__
1. Levantar Microservicios (Apis y DB): Navega al directorio raíz y usa Docker Compose para construir e iniciar los servicios:    
    - docker-compose up -d --build

2. Iniciar el Orquestador (Lambda): Navega al directorio lambda-orchestrator e inicia el servidor local simulado (vía serverless offline):
    - cd lambda-orchestrator
    - npm install
    - npm run rev

El sistema estará completamente funcional y listo para recibir peticiones en http://localhost:3000.

Para confirmar la correcta ejecución de las Apis:

- __Customers API:__ http://localhost:3001/health

- __Orders API:__ http://localhost:3002/health


## __Arquitectura del Sistema__
La solución se compone de tres servicios principales que operan bajo un modelo de Orquestación:

 Componente | Rol y Puerto | Función Principal | 
--- | --- | --- | 
 Lambda Orquestador | http://localhost:3000 | Orquesta el flujo (Crear -> Confirmar). Gestiona la Idempotencia y la Compensación.
Orders API | http://localhost:3002 | "Crea, actualiza y cancela órdenes. Intermediario para la reserva de stock."
| Customers API | http://localhost:3003 | Gestiona el inventario y el stock de productos (API de dependencia).

## __Cómo probar el Sistema__
__Endpoint Principal__

Método | URL | Función 
--- | --- | --- 
POST | http://localhost:3000/dev/orders/process	| Lanza la orquestación de la orden.

__JSON de Ejemplo__

Utiliza este formato para las pruebas:

JSON

{
    "customer_id": 1,
    "items": [
        {
            "sku": "prod-123",
            "quantity": 1
        }
    ]
}

1. Pruebas de Resiliencia e integridad

Prueba | Acción | Objetivo de la Prueba | Resultado Esperado
--- | --- | --- | --- | 
 Flujo Exitoso | Enviar JSON de ejemplo. | Verificar el flujo completo y el descuento de stock | 200 OK. Stock descontado correctamente.
 Idempotencia | Enviar el mismo JSON inmediatamente después.| Verificar que el request no se procesa dos veces. | 200 OK. Stock se mantiene sin cambios (servido desde caché de idempotencia). 
  Compensación (Rollback) | Forzar un fallo en la Confirmación (/confirm en Orders API).| Verificar que el stock es devuelto tras el fallo transaccional.| 500/400 Error. El stock vuelve a su valor inicial.
  Fallo de Stock | Enviar JSON con una quantity mayor al stock disponible.| Verificar la propagación correcta del error de negocio.| 400 Bad Request con mensaje de "Stock insuficiente" detallado.


  ## __Decisiones de Arquitectura__
1. __Implementación de Idempotencia__

La idempotencia está implementada en dos capas para máxima resiliencia:

- __Orquestador (lambda-orchestrator/):__ Genera una clave determinista basada en el contenido del request (cliente, items). Si la clave ya existe en la base de datos de idempotencia, devuelve la respuesta guardada sin iniciar la orquestación.

- __Orders API (/confirm):__ Utiliza un header de idempotencia para asegurar que el descuento de stock (la parte crítica) solo se ejecuta una vez, protegiendo contra reintentos de red.


2. __Patrón de Compensación (Saga Pattern)__

Para manejar la integridad transaccional:

- Si la Creación de la Orden es exitosa (paso 1) y la Confirmación falla (paso 2), el bloque catch del Lambda llama explícitamente a un endpoint de Compensación:


JavaScript

// Lógica en el catch del Orquestador
await axios.post(`${ORDERS_API_URL}/orders/${orderId}/cancel`); 

La Orders API es responsable de gestionar esta compensación, asegurando que el stock reservado se libere y la orden quede marcada como CANCELLED.

3. __Manejo de Errores__

El Lambda Orquestador está diseñado para propagar errores detallados. En caso de que la Orders API o Customers API devuelvan un error 4XX (ej. Stock insuficiente), el Orquestador extrae el mensaje de error del cuerpo (error.response.data.message o .error) y lo retransmite al cliente final.