# Data Model — 호텔 재고 관리 시스템

> 비즈니스 관점의 Entity 정의. 실제 코드에서 확인된 Entity만 기록.

---

## Entity Relationship

```
Item (품목) ──── 1:N ──── Transaction (입출고)
  │                         │
  │                         └── belongs to ── Shop (업장)
  │
  ├── has ── Category (카테고리, via BaseData)
  ├── has ── Unit (단위, via BaseData)
  └── tracked by ── Changelog (변경이력)

User (사용자) ──── N:M ──── Shop (업장)
  │
  └── has ── Role (역할)

Season (시즌) ──── affects ── SafetyStock calculation
```

---

## Entities

### Item (품목)
| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| code | String | ✅ | 품목코드 (PK, 유일) |
| name | String | ✅ | 품목명 |
| category | String | | 카테고리 (기초데이터 참조) |
| grade | String | | 규격 |
| unit | String | | 단위 (기초데이터 참조) |
| initStock | Number | | 초기재고 (기본 0) |
| currentStock | Number | | 현재고 (계산) |
| dailyUsage | Number | | 일평균 사용량 (계산) |
| leadTime | Number | | 리드타임 (일, 기본 3) |
| safetyDays | Number | | 안전재고일수 (기본 5) |
| targetDays | Number | | 목표유지일수 (기본 30) |
| safetyStock | Number | | 안전재고 (수식) |
| rop | Number | | 발주점 (수식) |
| orderQty | Number | | 적정발주량 (수식) |
| status | String | | 재고 상태 (수식: 위험/발주필요/정상) |
| taxType | String | | 과세구분 (과세/면세) |
| unitPrice | Number | | 매입단가 |
| supplyPrice | Number | | 공급단가 (수식) |
| taxAmount | Number | | 단위 세액 (수식) |
| totalValue | Number | | 재고 합계금액 (FIFO 계산) |
| usageStatus | String | | 사용유무 (사용/미사용) |

### Transaction (입출고)
| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| date | Date | ✅ | 거래일 |
| itemCode | String | ✅ | 품목코드 (FK → Item) |
| itemName | String | | 품목명 (자동 조회) |
| type | String | ✅ | 구분 (입고/출고/폐기) |
| qty | Number | ✅ | 수량 |
| unitPrice | Number | | 단가 스냅샷 (자동) |
| person | String | | 담당자 |
| note | String | | 비고 (최대 500자) |
| txId | String | | 거래ID (자동 생성, PK) |

### User (사용자)
| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| username | String | ✅ | 아이디 (PK, 이메일) |
| passHash | String | ✅ | 비밀번호 해시 (SHA-256+salt) |
| name | String | ✅ | 성함 |
| dept | String | | 부서 |
| role | String | ✅ | 역할 (admin/manager/staff) |
| assignedShops | String | | 배정 업장 (쉼표 구분) |

### Shop (업장)
| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| category | String | ✅ | 분류 (호텔/콘도 등) |
| name | String | ✅ | 업장명 (유일) |
| tag | String | ✅ | 거래ID 태그 (대문자 2~3자) |
| status | String | | 상태 (대기/생성완료/삭제됨) |
| link | Formula | | 시트 바로가기 |
| sheetId | Number | | Google Sheet GID |

### Season (시즌)
| 속성 | 타입 | 필수 | 설명 |
|------|------|------|------|
| name | String | ✅ | 시즌명 |
| start | Date | ✅ | 시작일 |
| end | Date | ✅ | 종료일 |
| multiplier | Number | ✅ | 안전재고 배수 |

### BaseData (기초데이터)
| 속성 | 설명 |
|------|------|
| mainCategories | 대분류 목록 (드롭다운) |
| units | 단위 목록 (드롭다운) |
| itemCategories | 품목 카테고리 목록 (드롭다운) |

### Changelog (변경이력)
| 속성 | 타입 | 설명 |
|------|------|------|
| timestamp | DateTime | 변경일시 |
| editor | String | 변경자 |
| itemCode | String | 품목코드 |
| itemName | String | 품목명 |
| field | String | 변경필드 |
| oldValue | String | 변경 전 |
| newValue | String | 변경 후 |

### SystemLog (시스템 로그)
| 속성 | 타입 | 설명 |
|------|------|------|
| timestamp | DateTime | 시각 |
| context | String | 함수명 |
| user | String | 사용자 |
| message | String | 에러 메시지 |
| stack | String | 스택 트레이스 |
| severity | String | 심각도 |
