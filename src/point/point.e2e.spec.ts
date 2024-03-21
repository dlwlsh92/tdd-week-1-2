import {INestApplication} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { PointModule } from "./point.module";


describe('Point 조회, 충전, 사용, 내역 조회 API 테스트', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [PointModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    })

    it('포인트 충전 및 사용 절차는 순차적이고, 정확하게 계산되어야 한다.', async () => {
        const userId = 1;
        const chargePoint = 50;
        const usePoint = 30;
        /**
         * 사용하려는 point보다 현재 point가 적을 경우는 유닛 테스트로 처리했으므로 error가 발생하는 것을 배제하기 위해 충분한 point를 가진다고 가정한다.
         * */
        const initialPoint = 10000;

        const requests = [];

        const { body: initialUserPoint } = await request(app.getHttpServer()).patch(`/point/${userId}/charge`).send({amount: initialPoint}).expect(200);
        console.log("=>(point.e2e.spec.ts:32) initialPoint", initialPoint);
        expect(initialUserPoint.point).toEqual(initialPoint);

        for (let i = 0; i < 10; i++) {
            requests.push(request(app.getHttpServer())
                .patch(`/point/${userId}/charge`)
                .send({amount: chargePoint})
                .expect(200)
            )
            requests.push(request(app.getHttpServer())
                .patch(`/point/${userId}/use/`)
                .send({amount: usePoint})
                .expect(200)
            )
        }

        await Promise.all(requests);

        const { body: finalUserPoint } = await request(app.getHttpServer()).get(`/point/${userId}`).expect(200);

        console.log("=>(point.e2e.spec.ts:45) finalUserPoint", finalUserPoint);


        const expectedPoint = 10000 + (chargePoint - usePoint) * 10;

        expect(finalUserPoint.point).toEqual(expectedPoint);
    }, 10000)

    it('user가 여러 명일 경우 각각의 user에 대한 point가 정확하게 계산되어야 한다.', async () => {
        const userIds = [6, 7, 8, 9, 10];
        const chargePoint = 50;
        const usePoint = 30;
        const initialPoint = 10000;

        const requests = [];

        for (let userId of userIds) {
            requests.push(request(app.getHttpServer())
                .patch(`/point/${userId}/charge`)
                .send({amount: initialPoint})
                .expect(200)
            )
        }

        for (let i = 0; i < 5; i++) {
            for (let userId of userIds) {
                requests.push(request(app.getHttpServer())
                    .patch(`/point/${userId}/charge`)
                    .send({amount: chargePoint})
                    .expect(200)
                )
                requests.push(request(app.getHttpServer())
                    .patch(`/point/${userId}/use/`)
                    .send({amount: usePoint})
                    .expect(200)
                )
            }
        }

        await Promise.all(requests);

        for (let userId of userIds) {
            const { body: finalUserPoint } = await request(app.getHttpServer()).get(`/point/${userId}`).expect(200);
            const expectedPoint = 10000 + (chargePoint - usePoint) * 5;
            expect(finalUserPoint.point).toEqual(expectedPoint);
        }

    }, 10000)

    afterAll(async () => {
        await app.close();
    })
})