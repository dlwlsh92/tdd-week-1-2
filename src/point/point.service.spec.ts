import {PointService} from "./point.service";
import {Test, TestingModule} from "@nestjs/testing";
import {UserPoint} from "./point.model";
import {UserPointTable} from "../database/userpoint.table";
import {PointHistoryTable} from "../database/pointhistory.table";


describe('Point 조회, 충전, 사용, 내역 조회 로직 테스트', () => {
    let pointService: PointService;
    let userDb: jest.Mocked<Partial<UserPointTable>>;
    let historyDb: jest.Mocked<Partial<PointHistoryTable>>;

    beforeEach( async () => {
        userDb = {
            selectById: jest.fn(),
            insertOrUpdate: jest.fn(),
        }

        historyDb = {
            selectAllByUserId: jest.fn(),
            insert: jest.fn(),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [PointService, {
                provide: UserPointTable,
                useValue: userDb,
            }, {
                provide: PointHistoryTable,
                useValue: historyDb,
            }],
        }).compile();
        pointService = module.get<PointService>(PointService);
        /**
         * withUserLock 메소드를 mock으로 대체해서 mutex를 배제한 상태로 테스트를 진행한다.
         */
        jest.spyOn(pointService, 'withUserLock').mockImplementation(async (userId, fn) => fn());
    })

    afterAll(() => {
        jest.clearAllMocks();
    })

    it('test', () => {
        expect(true).toBe(true);
    })

    /**
     * 유저의 포인트를 조회, 충전, 사용, 내역을 조회하는 로직을 테스트 합니다.
     * controller에서 id를 넘겨주기 전에 적용하는 Number.parseInt()는 유효하지 않은 id가 들어왔을 때, NaN을 반환하고, 소수가 들어올 경우 소수점을 버린다.
     * amount는 class-validator의 @IsInt() 데코레이터를 통해 유효하지 않은 값이 들어왔을 때, 에러를 반환하므로 service에는 number 타입으로 넘어온다고 가정한다.
     * */

    describe('포인트를 조회, 충전, 사용, 내역조회를 하는 로직을 테스트 할 때, 유효한 id 혹은 amount 인지 검증하는 테스트', () => {
        it('조회하려는 id가 음수일 경우, 에러를 반환한다.', () => {
            const userId = -1;
            expect(() => pointService.isValidId(userId)).toThrow('올바르지 않은 ID 값 입니다.')
        })

        it('조회하려는 id가 유효하지 않은 숫자일 경우, 에러를 반환한다.', () => {
            const userId = NaN;
            expect(() => pointService.isValidId(userId)).toThrow('올바르지 않은 ID 값 입니다.')
        })

        it('충전 혹은 사용하려는 포인트가 음수일 경우, 에러를 반환한다.', () => {
            // class-validator에 의해 인자로 들어온 amount는 number 타입이라고 가정한다.
            const amount = -1;
            expect(() => pointService.isValidAmount(amount)).toThrow('올바르지 않은 포인트 값 입니다.')
        })
    })

    describe('포인트를 사용하는 로직에 대한 테스트', () => {
        it('현재 포인트가 사용하려는 포인트보다 적을 경우 에러를 반환한다.', async () => {
            const userId = 2;
            const amount = 500;
            jest.spyOn(userDb, 'selectById').mockResolvedValue({id: userId, point: 300, updateMillis: Date.now()});
            await expect(() => pointService.usePoint(userId, amount)).rejects.toThrow('포인트가 부족합니다.')
        })

        it('포인트를 사용하면 사용한 포인트만큼 차감된 포인트를 반환한다.', async () => {
            const userId = 3;
            const useAmount = 500;
            const currentPoint = 1000;
            jest.spyOn(userDb, 'selectById').mockResolvedValue({id: userId, point: currentPoint, updateMillis: Date.now()});
            jest.spyOn(userDb, 'insertOrUpdate').mockImplementation((id, amount) => Promise.resolve({id, point: currentPoint - useAmount, updateMillis: Date.now()}))
            const userPoint: UserPoint = await pointService.usePoint(userId, useAmount);
            expect(userPoint.point).toBe(500);
        })
    })

    describe('포인트를 충전하는 로직에 대한 테스트', () => {
        it('포인트를 충전하면 충전한 포인트만큼 증가된 포인트를 반환한다.', async () => {
            const userId = 4;
            const ChargeAmount = 500;
            const currentPoint = 1000;
            jest.spyOn(userDb, 'selectById').mockResolvedValue({id: userId, point: currentPoint, updateMillis: Date.now()});
            jest.spyOn(userDb, 'insertOrUpdate').mockImplementation((id, amount) => Promise.resolve({id, point: currentPoint + ChargeAmount, updateMillis: Date.now()}))
            const userPoint: UserPoint = await pointService.chargePoint(userId, ChargeAmount);
            expect(userPoint.point).toBe(1500);
        })
    })

    describe('포인트 내역을 조회하는 로직에 대한 테스트', () => {
        it('포인트 내역이 없는 경우 빈 배열을 반환한다.', async () => {
            const userId = 5;
            jest.spyOn(historyDb, 'selectAllByUserId').mockResolvedValue([]);
            const pointHistory = await pointService.getUserPointHistory(userId);
            expect(pointHistory).toEqual([]);
        })

        it('조회한 포인트 내역의 각 항목은 객체의 timeMillis가 빠른 순으로 정렬되어야 한다.', async () => {
            /**
             * PointHistoryTable의 insert에 존재하는 setTimeout에 의해 요청이 들어온 순서대로 데이터가 삽입되었다는 보장이 없으므로 timeMillis를 기준으로 정렬하는 로직을 추가해야 한다.
             * */
            jest.spyOn(historyDb, 'selectAllByUserId').mockResolvedValue([
                {
                    id: 3,
                    userId: 1,
                    type: 0,
                    amount: 500,
                    timeMillis: 1500,
                },
                {
                    id: 1,
                    userId: 1,
                    type: 1,
                    amount: 200,
                    timeMillis: 500,
                },
                {
                    id: 2,
                    userId: 1,
                    type: 0,
                    amount: 100,
                    timeMillis: 1000,
                },
            ])
            const pointHistory = await pointService.getUserPointHistory(1);
            expect(pointHistory).toEqual([
                {
                    id: 1,
                    userId: 1,
                    type: 1,
                    amount: 200,
                    timeMillis: 500,
                },
                {
                    id: 2,
                    userId: 1,
                    type: 0,
                    amount: 100,
                    timeMillis: 1000,
                },
                {
                    id: 3,
                    userId: 1,
                    type: 0,
                    amount: 500,
                    timeMillis: 1500,
                },
            ])
        })
    })


})